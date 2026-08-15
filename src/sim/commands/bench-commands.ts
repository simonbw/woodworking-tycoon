import { Game } from "../../core/Game";
import { stationWorkSpeed } from "../../game/bench-mounting";
import {
  benchGroupAt,
  memberFor,
  placementInFrame,
  placementOnMember,
} from "../../game/bench-work/bench-group";
import {
  BenchPlacement,
  benchPlacementFor,
  palletStackPlacement,
} from "../../game/bench-work/bench-layout";
import {
  gluePrepShortfall,
  inferGlueOperationId,
} from "../../game/bench-work/glue-up";
import {
  isSameNail,
  palletSlotId,
  PalletBoardRef,
} from "../../game/bench-work/pallet-geometry";
import { palletBoard } from "../../game/board-helpers";
import { clampsFor, clampsFree } from "../../game/Clamp";
import { addConsumables } from "../../game/Consumable";
import { deriveMachineCutLoad } from "../../game/cut-load";
import { emitMachineDust, machineDustMultiplier } from "../../game/Dust";
import {
  BENCH_DUST_EMISSIONS_PER_SECOND,
  palletPryTargetsLeft,
  prunedBenchLayout,
} from "../../game/game-actions/operation-actions";
import { GameState } from "../../game/GameState";
import { getMachines, machineKey } from "../../game/Machine";
import { playerAttendsMachine } from "../../game/machine-helpers";
import { materialDustSpecies } from "../../game/material-helpers";
import { MaterialInstance, PalletNail } from "../../game/Materials";
import {
  availableOperations,
  getOperationPhases,
} from "../../game/skill-helpers";
import { MachineEntity } from "../entities/MachineEntity";
import { projectGameState } from "../projection";
import { Consumables } from "../singletons/Consumables";
import { DustLayer } from "../singletons/DustLayer";

/**
 * The bench-work command surface — the old `operation-actions.ts` commit
 * actions, rehosted onto entities. The commit-action split holds (see
 * docs/bench-work.md): the bench view (and the ShopDriver) decides
 * *when*, these commands decide *what*. Each validates through the same
 * shared helpers over a projection snapshot, then writes onto the
 * entities; refusals log and return false, matching the old actions'
 * quiet-refusal contract. The bench-work engine itself
 * (`src/game/bench-work/`) is pure and shared, never forked.
 *
 * `finishAttendedWork` — the finish commit these commands pair with —
 * already lives in machine-commands.ts.
 */

export { palletPryTargetsLeft } from "../../game/game-actions/operation-actions";

function emitSound(game: Game, kind: string): void {
  game.dispatch("sound", { sound: { kind } as never });
}

/**
 * Whether this player position can legally commit hand work at this
 * machine right now — standing in the operator's apron, not away.
 */
function attends(gameState: GameState, entity: MachineEntity): boolean {
  return playerAttendsMachine(
    entity.view(),
    gameState.player.position,
    gameState.player.away !== null,
  );
}

/**
 * Whether the station's bench view would be offering pry work right now:
 * idle, a pallet staged, dismantling known. Mirrors benchScriptFor's
 * pallet-wins rule — no plan selection involved. (The old driver held
 * this privately; it lives on the command surface here because the new
 * driver may not read the old transform layer.)
 */
export function benchOffersPry(game: Game, entity: MachineEntity): boolean {
  const gameState = projectGameState(game);
  const machine = entity.view();
  return (
    machine.operationProgress.status !== "inProgress" &&
    palletPryTargetsLeft(machine) > 0 &&
    availableOperations(machine, gameState.progression).some(
      (op) => op.interaction?.kind === "pry",
    )
  );
}

/**
 * One nail pried out of the pallet staged at this bench — the old
 * `pryPalletNailAction`. Every pull is real state: the nail leaves
 * Pallet.nails and lands in the shop's stock immediately, and any board
 * that just lost its last nail comes free right there on the bench (it
 * joins inputMaterials, lying on its berth). A nail joins a deck board
 * to a stringer, so one pull loosens both — and the last nail on a
 * crossing can free both at once.
 *
 * The bench view passes the nail the player actually pried; without one
 * (the driver's path) the first remaining nail pulls, which walks the
 * deck board by board.
 */
export function pryPalletNail(
  game: Game,
  entity: MachineEntity,
  target?: PalletNail,
): boolean {
  const gameState = projectGameState(game);
  const machineState = entity.state;
  if (machineState.operationProgress.status === "inProgress") {
    console.warn("The bench is mid-operation — no room to pry");
    return false;
  }
  if (!attends(gameState, entity)) {
    console.warn("Can't pry a nail from across the shop");
    return false;
  }
  const live = entity.view();
  if (
    !availableOperations(live, gameState.progression).some(
      (op) => op.id === "dismantlePallet",
    )
  ) {
    console.warn("Dismantling isn't available at this station");
    return false;
  }
  const pallet = machineState.inputMaterials.find(
    (material) => material.type === "pallet",
  );
  if (!pallet || pallet.type !== "pallet") {
    console.warn("No pallet staged on the bench");
    return false;
  }

  const nail = target
    ? (pallet.nails.find((n) => isSameNail(target, n)) ?? null)
    : (pallet.nails[0] ?? null);
  if (!nail) {
    console.warn("No such nail left on the pallet to pry");
    return false;
  }
  const nails = pallet.nails.filter((n) => n !== nail);

  // The pull loosens both boards the nail joined; each comes free the
  // moment its last nail is out (the very last nail frees two).
  const freedRefs: PalletBoardRef[] = [];
  const deckBoards = [...pallet.deckBoards] as typeof pallet.deckBoards;
  const stringers = [...pallet.stringers] as typeof pallet.stringers;
  if (deckBoards[nail.deck] && !nails.some((n) => n.deck === nail.deck)) {
    deckBoards[nail.deck] = false;
    freedRefs.push({ kind: "deck", index: nail.deck });
  }
  if (
    stringers[nail.stringer] &&
    !nails.some((n) => n.stringer === nail.stringer)
  ) {
    stringers[nail.stringer] = false;
    freedRefs.push({ kind: "stringer", index: nail.stringer });
  }
  const boardsLeft =
    deckBoards.filter(Boolean).length + stringers.filter(Boolean).length;
  const remainingPallet =
    boardsLeft > 0 ? { ...pallet, deckBoards, stringers, nails } : null;

  // A freed board's id doubles as its sprite seed and matches the seed
  // the pallet drew it with (see PalletSprite), so the very same grain
  // comes off the pallet — the pull frees the board, it doesn't swap it
  // for a different one.
  const freedBoards = freedRefs.map((ref) => ({
    ...palletBoard(),
    id: palletSlotId(pallet, ref),
  }));

  // The nail lands in the shop-wide stock the moment it's out.
  const consumables = game.entities.getSingleton(Consumables);
  consumables.stock = addConsumables(consumables.stock, [
    { id: "nails", amount: 1 },
  ]);

  // Freed boards stay right on the bench: loose stock the next plan can
  // claim, or E takes back into the arms — tossed onto the pile in the
  // back-left corner rather than left lying in the pallet's footprint,
  // where they'd bury the nails still to pull.
  const inputMaterials = [
    ...machineState.inputMaterials.filter((material) => material !== pallet),
    ...(remainingPallet ? [remainingPallet] : []),
    ...freedBoards,
  ];
  entity.state = {
    ...machineState,
    inputMaterials,
    benchLayout: {
      ...prunedBenchLayout(machineState.benchLayout, [
        ...inputMaterials,
        ...machineState.outputMaterials,
      ]),
      ...Object.fromEntries(
        freedBoards.map((freedBoard, i) => [
          freedBoard.id,
          palletStackPlacement(live.type, freedRefs[i], freedBoard.id),
        ]),
      ),
    },
  };
  // The nail's own creak-and-pop; a board settling is part of it.
  emitSound(game, "nail-pry");
  return true;
}

/**
 * The tighten-the-last-clamp commit — the old `startGlueUpAction`: a
 * clamps-first glue-up claims the very pieces lying in the clamps, in
 * the across order they lie (the bench view detects the run; this
 * command trusts the given order the same way a blueprint claim trusts
 * slot order for the driver's unseated path). The composition decides
 * which recipe is credited, exactly as the stock on a direct-feed
 * machine decides the cut. The view follows this with
 * `finishAttendedWork` — the hand work IS the attended phase — which
 * rolls it into the cure.
 */
export function startGlueUp(
  game: Game,
  entity: MachineEntity,
  pieceIds: ReadonlyArray<string>,
): boolean {
  const gameState = projectGameState(game);
  const machineState = entity.state;
  if (machineState.operationProgress.status === "inProgress") {
    console.warn("The bench is mid-operation — no room for a glue-up");
    return false;
  }
  if (!attends(gameState, entity)) {
    console.warn("Can't tighten clamps from across the shop");
    return false;
  }
  // The run may include finished work still lying on the bench (a fresh
  // panel going straight into a wider one), same as tool claims
  const bays = [
    ...machineState.inputMaterials,
    ...machineState.outputMaterials,
  ];
  const pieces = pieceIds.map(
    (id) => bays.find((material) => material.id === id) ?? null,
  );
  if (pieces.some((piece) => piece === null) || pieces.length < 2) {
    console.warn("The glue-up names pieces that aren't on the bench");
    return false;
  }
  const run = pieces as ReadonlyArray<MaterialInstance>;
  for (const piece of run) {
    const shortfall = gluePrepShortfall(piece);
    if (shortfall) {
      console.warn(`Not glueable: ${shortfall}`);
      return false;
    }
  }
  // One thickness, one length — the same bar the recipes always set
  const spanOf = (m: MaterialInstance) =>
    m.type === "board" || m.type === "panel" ? m.length : null;
  const thicknessOf = (m: MaterialInstance) =>
    m.type === "board" || m.type === "panel" || m.type === "endGrainSlice"
      ? m.thickness
      : null;
  const firstSpan = spanOf(run[0]);
  if (
    !run.every((m) => thicknessOf(m) === thicknessOf(run[0])) ||
    !run.every((m) => {
      const span = spanOf(m);
      return (
        span === null || firstSpan === null || Math.abs(span - firstSpan) <= 0.5
      );
    })
  ) {
    console.warn("A glue-up takes one thickness and one length of stock");
    return false;
  }
  const operationId = inferGlueOperationId(run);
  if (!operationId) {
    console.warn("Those pieces don't add up to any glue-up");
    return false;
  }
  const live = entity.view();
  const operation = availableOperations(live, gameState.progression).find(
    (op) => op.id === operationId,
  );
  if (!operation) {
    console.warn("That glue-up isn't known at this station yet");
    return false;
  }
  // Clamps are borrowed, not spent: this operation starting IS the
  // checkout (the count in use is derived — see Clamp.ts), and the cure
  // finishing is the return.
  if (
    clampsFor(operation, run) > clampsFree(gameState.clamps, gameState.machines)
  ) {
    console.warn("Not enough free clamps for a run this long");
    return false;
  }
  const [firstPhase] = getOperationPhases(
    operation,
    gameState.progression,
    machineDustMultiplier(gameState.dust, live, gameState.shopInfo.size),
    stationWorkSpeed(live, gameState),
  );
  entity.state = {
    ...machineState,
    selectedOperationId: operationId,
    inputMaterials: machineState.inputMaterials.filter(
      (material) => !pieceIds.includes(material.id),
    ),
    outputMaterials: machineState.outputMaterials.filter(
      (material) => !pieceIds.includes(material.id),
    ),
    processingMaterials: [...run],
    operationProgress: {
      status: "inProgress" as const,
      phaseIndex: 0,
      ticksRemaining: firstPhase.duration,
    },
  };
  return true;
}

/**
 * Commit where a piece lies on the bench top — the drag, turn, or flip
 * the player just made in the bench view (the old
 * `arrangeBenchMaterialAction`). The arrangement is real state (see
 * bench-work/bench-layout.ts), so it survives closing the view and shows
 * on the shop floor too.
 */
export function arrangeBenchMaterial(
  game: Game,
  entity: MachineEntity,
  materialId: string,
  placement: BenchPlacement,
): boolean {
  const machineState = entity.state;
  // Finished work lies on the bench too until it's taken, so outputs
  // arrange the same way staged stock does.
  const onBench = [
    ...machineState.inputMaterials,
    ...machineState.outputMaterials,
  ];
  if (!onBench.some((material) => material.id === materialId)) {
    return false;
  }
  entity.state = {
    ...machineState,
    benchLayout: {
      ...prunedBenchLayout(machineState.benchLayout, [
        ...machineState.inputMaterials,
        ...machineState.outputMaterials,
      ]),
      [materialId]: placement,
    },
  };
  return true;
}

/**
 * Slide pieces off the neighbouring tables onto this one, keeping every
 * one exactly where it physically lies — the old
 * `gatherBenchPiecesAction`.
 *
 * Tables pushed together work as one bench (bench-work/bench-group.ts),
 * but an operation still consumes from a single machine's bays — so a
 * glue-up whose run straddles a seam, or a build whose parts came off
 * two tables, needs its pieces on one table before it can commit.
 * Placements are re-measured through the group frame, so nothing appears
 * to move: a board lying across the seam is at the same spot on the
 * floor before and after, it's just bookkept by the other table now.
 */
export function gatherBenchPieces(
  game: Game,
  target: MachineEntity,
  pieceIds: ReadonlyArray<string>,
): boolean {
  const gameState = projectGameState(game);
  const targetMachine = target.view();
  const group = benchGroupAt(getMachines(gameState.machines), targetMachine);
  const onto = memberFor(group, targetMachine);
  if (!onto || group.members.length < 2) {
    return false;
  }

  const wanted = new Set(pieceIds);
  const takenInputs: MaterialInstance[] = [];
  const takenOutputs: MaterialInstance[] = [];
  const arrivals: Record<string, BenchPlacement> = {};
  const strippedFrom = new Set<string>();

  for (const member of group.members) {
    if (member.key === onto.key) {
      continue;
    }
    const claim = (material: MaterialInstance, bay: MaterialInstance[]) => {
      if (!wanted.has(material.id)) {
        return;
      }
      bay.push(material);
      strippedFrom.add(member.key);
      // The same spot on the floor, measured into its new owner's frame
      arrivals[material.id] = placementOnMember(
        group,
        onto,
        placementInFrame(
          group,
          member,
          benchPlacementFor(member.machine, material),
        ),
      );
    };
    member.machine.inputMaterials.forEach((m) => claim(m, takenInputs));
    member.machine.outputMaterials.forEach((m) => claim(m, takenOutputs));
  }

  if (takenInputs.length === 0 && takenOutputs.length === 0) {
    return false;
  }

  const moved = new Set(
    [...takenInputs, ...takenOutputs].map((material) => material.id),
  );
  for (const entity of game.entities.byConstructor(MachineEntity)) {
    if (entity === target) {
      const inputMaterials = [...entity.state.inputMaterials, ...takenInputs];
      const outputMaterials = [
        ...entity.state.outputMaterials,
        ...takenOutputs,
      ];
      entity.state = {
        ...entity.state,
        inputMaterials,
        outputMaterials,
        benchLayout: {
          ...prunedBenchLayout(entity.state.benchLayout, [
            ...inputMaterials,
            ...outputMaterials,
          ]),
          ...arrivals,
        },
      };
      continue;
    }
    if (!strippedFrom.has(machineKey(entity.state))) {
      continue;
    }
    const inputMaterials = entity.state.inputMaterials.filter(
      (material) => !moved.has(material.id),
    );
    const outputMaterials = entity.state.outputMaterials.filter(
      (material) => !moved.has(material.id),
    );
    entity.state = {
      ...entity.state,
      inputMaterials,
      outputMaterials,
      benchLayout: prunedBenchLayout(entity.state.benchLayout, [
        ...inputMaterials,
        ...outputMaterials,
      ]),
    };
  }
  return true;
}

/**
 * One throttled emission of hand-work dust — the old
 * `emitBenchDustAction`: what the tick would have shed over the
 * equivalent stretch of attended machine time (dustOutput is per tick at
 * 5 ticks/second, scaled by the cut load the way machineTickPass scales
 * it). The bench view calls this about twice a second while the tool is
 * moving; sanding a whole board sheds roughly the same total mess either
 * way. Writes straight onto the DustLayer singleton.
 */
export function emitBenchDust(game: Game, entity: MachineEntity): boolean {
  const gameState = projectGameState(game);
  const machineState = entity.state;
  const live = entity.view();
  const operation = live.operations.find(
    (op) => op.id === machineState.selectedOperationId,
  );
  const dustOutput = operation?.dustOutput ?? 0;
  if (dustOutput === 0) {
    return false;
  }
  const materials =
    machineState.processingMaterials.length > 0
      ? machineState.processingMaterials
      : machineState.inputMaterials;
  const species = [...new Set(materials.flatMap(materialDustSpecies))];
  if (species.length === 0) {
    return false;
  }
  const ticksPerEmission = 5 / BENCH_DUST_EMISSIONS_PER_SECOND;
  const dustLayer = game.entities.getSingleton(DustLayer);
  dustLayer.map = emitMachineDust(
    dustLayer.map,
    live,
    species,
    dustOutput * deriveMachineCutLoad(live) * ticksPerEmission,
    gameState.shopInfo.size,
  );
  return true;
}
