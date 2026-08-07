import { addConsumables, ConsumableAmount } from "../Consumable";
import { machineDustMultiplier } from "../Dust";
import { GameAction, GameState } from "../GameState";
import {
  getMachines,
  isSameMachine,
  Machine,
  machineKey,
  MachineId,
  MachineState,
  Operation,
} from "../Machine";
import { board } from "../board-helpers";
import { isFinishedProduct } from "../material-helpers";
import { getSellValue } from "../material-values";
import { playerAttendsMachine } from "../machine-helpers";
import { availableOperations, getOperationPhases } from "../skill-helpers";
import { SoundEvent } from "../SoundEvent";
import { UpgradeId } from "../Upgrade";
import { Vector } from "../Vectors";
import { deliverMachineCrate, freshMachineState } from "./machine-actions";
import { withXp } from "./skill-actions";
import { MaterialInstance, PalletNail } from "../Materials";
import {
  BenchPlacement,
  benchPlacementFor,
  berthPlacementOnBench,
  defaultBenchPlacement,
} from "../bench-work/bench-layout";
import {
  benchGroupAt,
  memberFor,
  placementInFrame,
  placementOnMember,
} from "../bench-work/bench-group";
import {
  isSameNail,
  palletBoardSlot,
  palletSlotId,
  PalletBoardRef,
} from "../bench-work/pallet-geometry";
import { deriveMachineCutLoad } from "../cut-load";
import { emitMachineDust } from "../Dust";
import { materialSpecies } from "../material-helpers";
import { clampsFor, clampsFree } from "../Clamp";
import { gluePrepShortfall, inferGlueOperationId } from "../bench-work/glue-up";

/**
 * The commit-action split (see docs/bench-work.md): the bench view
 * decides *when*, these actions decide *what*. Starting an operation is
 * still `operateMachineAction` — it claims inputs, spends supplies, and
 * checks the clamp rack exactly as before. Finishing is here: the
 * completion block that used to live only at the bottom of
 * `machineTickPass`, extracted so the bench view (and the ShopDriver) can
 * dispatch it when interactive hand work is done. `machineTickPass` calls
 * the same helpers, so a tick-completed cut and a hand-finished sanding
 * pass are indistinguishable in what they do to the shop.
 */

/** Everything one finished operation does to the shop, staged. */
export interface OperationCompletion {
  /** The machine after the work comes off: outputs in the bay, idle. */
  readonly machine: MachineState;
  readonly xp: number;
  readonly soundEvents: ReadonlyArray<SoundEvent>;
  readonly machinesGranted: ReadonlyArray<{
    machineTypeId: MachineId;
    near: Vector;
  }>;
  readonly upgradesGranted: ReadonlyArray<UpgradeId>;
  readonly consumablesGranted: ReadonlyArray<ConsumableAmount>;
}

/**
 * Resolve a machine's in-progress operation into its completion: outputs
 * computed from inputs and parameters (`Operation.output` — performance
 * never touches quality), XP for finished products, the completion sound,
 * and any granted machines, upgrades, or salvaged supplies.
 */
export function completeOperation(
  machineState: MachineState,
): OperationCompletion {
  // Look the operation up through the Machine view so mounted tools'
  // operations resolve too.
  const machine = new Machine(machineState);
  const selectedOperation = machine.operations.find(
    (op) => op.id === machineState.selectedOperationId,
  );
  if (!selectedOperation) {
    throw new Error(
      `Unknown operation: ${machineState.selectedOperationId} for machine ${machineState.machineTypeId}`,
    );
  }

  const { inputs, outputs, consumableOutputs, machineOutputs, upgradeOutputs } =
    selectedOperation.output(
      machineState.processingMaterials,
      machine.resolvedParameters(selectedOperation),
    );

  let xp = 0;
  for (const output of outputs) {
    if (isFinishedProduct(output)) {
      xp += Math.round(getSellValue(output));
    }
  }

  return {
    machine: {
      ...machineState,
      inputMaterials: [...machineState.inputMaterials, ...inputs],
      processingMaterials: [],
      outputMaterials: [...machineState.outputMaterials, ...outputs],
      benchLayout: inheritedBenchLayout(
        machineState,
        selectedOperation,
        outputs,
      ),
      operationProgress: {
        status: "notStarted" as const,
        phaseIndex: 0,
        ticksRemaining: 0,
      },
    },
    xp,
    // The clip is chosen by operation, so tool operations sound like the
    // tool (see GameSoundLayer).
    soundEvents: [
      {
        kind: "operation-complete",
        machineTypeId: machineState.machineTypeId,
        operationId: machineState.selectedOperationId,
      },
    ],
    // Shop-built furniture (worktables) comes off the bench crated, ready
    // to be carried into place.
    machinesGranted: (machineOutputs ?? []).map((machineTypeId) => ({
      machineTypeId,
      near: machine.absoluteOperationPosition ?? machine.position,
    })),
    // Shop-built worktable upgrades (drawers, shelves) land in upgrade
    // storage, to be installed from a table's card.
    upgradesGranted: upgradeOutputs ?? [],
    // Salvaged supplies (e.g. pallet nails) go to the shop-wide stock.
    consumablesGranted: consumableOutputs ?? [],
  };
}

/**
 * Where the finished work lies: in-place tool work (stroke, saw)
 * transforms the piece where it was left, so the outputs inherit the
 * workpiece's spot instead of scattering to a fresh default seat. A
 * single output (a sanded face, a straightened edge) stays put exactly;
 * a saw's kept piece and offcut lie end to end inside the original
 * footprint, parted at the mark — where the cut physically left them.
 * Everything else keeps its layout untouched (a blueprint product's
 * centered seat is already its ghost frame's).
 */
function inheritedBenchLayout(
  machineState: MachineState,
  operation: Operation,
  outputs: ReadonlyArray<MaterialInstance>,
): MachineState["benchLayout"] {
  const kind = operation.interaction?.kind;
  // A cured glue-up comes out of the clamps one panel, lying where the
  // run lay: its seat is the run's centroid, at the run's angle.
  if (kind === "glue" && outputs.length === 1) {
    const seats = machineState.processingMaterials
      .map((piece) => machineState.benchLayout?.[piece.id])
      .filter((seat): seat is BenchPlacement => seat != null);
    if (seats.length === 0) {
      return machineState.benchLayout;
    }
    const layout: Record<string, BenchPlacement> = {
      ...machineState.benchLayout,
    };
    for (const piece of machineState.processingMaterials) {
      delete layout[piece.id];
    }
    layout[outputs[0].id] = {
      xIn: seats.reduce((sum, seat) => sum + seat.xIn, 0) / seats.length,
      yIn: seats.reduce((sum, seat) => sum + seat.yIn, 0) / seats.length,
      angleDeg: seats[0].angleDeg,
      flipped: false,
    };
    return layout;
  }
  const workpiece = machineState.processingMaterials[0];
  if (
    (kind !== "stroke" && kind !== "saw") ||
    machineState.processingMaterials.length !== 1 ||
    outputs.length === 0
  ) {
    return machineState.benchLayout;
  }
  const machine = new Machine(machineState);
  const placement =
    machineState.benchLayout?.[workpiece.id] ??
    defaultBenchPlacement(machine.type, workpiece);
  const layout: Record<string, BenchPlacement> = {
    ...machineState.benchLayout,
  };
  delete layout[workpiece.id];
  const workpieceLength =
    workpiece.type === "board" || workpiece.type === "panel"
      ? workpiece.length
      : null;
  const rad = (placement.angleDeg * Math.PI) / 180;
  let runIn = 0;
  for (const output of outputs) {
    const outputLength =
      output.type === "board" || output.type === "panel" ? output.length : null;
    // Offset along the piece's length axis (local +y, unaffected by a
    // flip's mirror), measured from the original board's top end
    const offsetIn =
      workpieceLength !== null && outputLength !== null
        ? runIn + outputLength / 2 - workpieceLength / 2
        : 0;
    layout[output.id] = {
      ...placement,
      xIn: placement.xIn - offsetIn * Math.sin(rad),
      yIn: placement.yIn + offsetIn * Math.cos(rad),
    };
    runIn += outputLength ?? 0;
  }
  return layout;
}

/**
 * Land every grant a batch of completions carries: sounds, upgrades,
 * crated machines, salvaged supplies, XP. The machines themselves must
 * already be swapped into `gameState.machines` by the caller (the tick
 * updates all of them in one map; the bench view swaps just one).
 */
export function applyCompletionGrants(
  gameState: GameState,
  completions: ReadonlyArray<OperationCompletion>,
): GameState {
  const soundEvents = completions.flatMap((c) => c.soundEvents);
  const upgradesGranted = completions.flatMap((c) => c.upgradesGranted);
  const machinesGranted = completions.flatMap((c) => c.machinesGranted);
  const consumablesGranted = completions.flatMap((c) => c.consumablesGranted);
  const xpEarned = completions.reduce((sum, c) => sum + c.xp, 0);

  // Only override pendingSounds when there's something to add, so quiet
  // ticks keep the queue's reference stable and don't re-trigger the
  // sound drain.
  const nextState =
    soundEvents.length > 0
      ? {
          ...gameState,
          pendingSounds: [...(gameState.pendingSounds ?? []), ...soundEvents],
        }
      : gameState;

  let withUpgrades: GameState =
    upgradesGranted.length > 0
      ? {
          ...nextState,
          storage: {
            ...nextState.storage,
            upgrades: [...nextState.storage.upgrades, ...upgradesGranted],
          },
        }
      : nextState;

  // Shop-built machines land crated beside the bench that made them
  for (const granted of machinesGranted) {
    withUpgrades = deliverMachineCrate(
      withUpgrades,
      freshMachineState(granted.machineTypeId, withUpgrades.progression),
      granted.near,
    );
  }

  const withConsumables =
    consumablesGranted.length > 0
      ? {
          ...withUpgrades,
          consumables: addConsumables(
            withUpgrades.consumables,
            consumablesGranted,
          ),
        }
      : withUpgrades;

  return withXp(withConsumables, xpEarned);
}

/** The machine's live state by identity, or null if it left the floor. */
function findMachineState(
  gameState: GameState,
  machine: Machine,
): MachineState | null {
  return (
    gameState.machines.find((m) => isSameMachine(m, machine.state)) ?? null
  );
}

/**
 * Whether this player position can legally commit hand work at this
 * machine right now — standing in the operator's apron, not away.
 */
function attends(gameState: GameState, machineState: MachineState): boolean {
  return playerAttendsMachine(
    new Machine(machineState),
    gameState.player.position,
    gameState.player.away !== null,
  );
}

/**
 * The bench view's finish commit: the interactive script is done, so the
 * attended phase resolves. For a single-phase operation (sanding, a hand
 * saw cut, assembly) that is the completion itself; for one with a
 * hands-free remainder (a glue-up's cure) it enters the next phase and
 * hands the rest to the tick, exactly as an attended tick-boundary would.
 *
 * Guarded like the tick: the operation must be in progress, interactive,
 * and the player standing at the station — the bench view can only be
 * open there, and the ShopDriver walks there first.
 */
export function finishAttendedWorkAction(machine: Machine): GameAction {
  return (gameState) => {
    const machineState = findMachineState(gameState, machine);
    if (
      !machineState ||
      machineState.operationProgress.status !== "inProgress"
    ) {
      console.warn("No interactive work in progress to finish");
      return gameState;
    }
    const live = new Machine(machineState);
    const operation = live.operations.find(
      (op) => op.id === machineState.selectedOperationId,
    );
    if (!operation?.interaction) {
      console.warn("The running operation has no interactive script");
      return gameState;
    }
    if (!attends(gameState, machineState)) {
      console.warn("Can't finish hand work from across the shop");
      return gameState;
    }

    const phases = getOperationPhases(
      operation,
      gameState.progression,
      machineDustMultiplier(gameState.dust, live, gameState.shopInfo.size),
      live.workSpeed,
    );
    const { phaseIndex } = machineState.operationProgress;
    if (phases[Math.min(phaseIndex, phases.length - 1)].attended === false) {
      console.warn("The hands-free phase finishes on its own — let it cure");
      return gameState;
    }

    // A hands-free remainder (the cure) picks up where the hands left off
    if (phaseIndex < phases.length - 1) {
      const nextPhase = phases[phaseIndex + 1];
      return {
        ...gameState,
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                operationProgress: {
                  status: "inProgress" as const,
                  phaseIndex: phaseIndex + 1,
                  ticksRemaining: nextPhase.duration,
                },
              }
            : m,
        ),
      };
    }

    const completion = completeOperation(machineState);
    return applyCompletionGrants(
      {
        ...gameState,
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState) ? completion.machine : m,
        ),
      },
      [completion],
    );
  };
}

/**
 * One nail pried out of the pallet staged at this bench — the pilot for
 * incremental commits. Every pull is real state: the nail leaves
 * Pallet.nails and lands in the shop's stock immediately, and any board
 * that just lost its last nail comes free right there on the bench (it
 * joins inputMaterials, lying on its berth, where the next recipe's
 * stagedPieces will find it). A nail joins a deck board to a stringer,
 * so one pull loosens both — and the last nail on a crossing can free
 * both at once. Refresh mid-dismantle and you resume at the exact nail
 * you left, not because mini-game state was saved, but because every
 * pull WAS game state.
 *
 * The bench view passes the nail the player actually pried; without one
 * (the driver's path) the first remaining nail pulls, which walks the
 * deck board by board.
 */
export function pryPalletNailAction(
  machine: Machine,
  target?: PalletNail,
): GameAction {
  return (gameState) => {
    const machineState = findMachineState(gameState, machine);
    if (!machineState) {
      console.warn("No such bench to pry at");
      return gameState;
    }
    if (machineState.operationProgress.status === "inProgress") {
      console.warn("The bench is mid-operation — no room to pry");
      return gameState;
    }
    if (!attends(gameState, machineState)) {
      console.warn("Can't pry a nail from across the shop");
      return gameState;
    }
    const live = new Machine(machineState);
    if (
      !availableOperations(live, gameState.progression).some(
        (op) => op.id === "dismantlePallet",
      )
    ) {
      console.warn("Dismantling isn't available at this station");
      return gameState;
    }
    const pallet = machineState.inputMaterials.find(
      (material) => material.type === "pallet",
    );
    if (!pallet || pallet.type !== "pallet") {
      console.warn("No pallet staged on the bench");
      return gameState;
    }

    const nail = target
      ? (pallet.nails.find((n) => isSameNail(target, n)) ?? null)
      : (pallet.nails[0] ?? null);
    if (!nail) {
      console.warn("No such nail left on the pallet to pry");
      return gameState;
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
    // keeps lying there — the pull frees the board, it doesn't swap it
    // for a different one. And it keeps lying on its berth: the
    // placement lands in the bench layout in the same commit, so nothing
    // pops or reshuffles.
    const freedBoards = freedRefs.map((ref) => ({
      ...(ref.kind === "deck"
        ? board("pallet", 36, 4, 2)
        : board("pallet", 48, 6, 6)),
      id: palletSlotId(pallet, ref),
    }));
    // The berth rides the pallet's own arrangement: dragged aside,
    // turned, or flipped, the freed board lies where the slot really is
    const palletPlacement =
      machineState.benchLayout?.[pallet.id] ??
      defaultBenchPlacement(live.type, pallet);

    return {
      ...gameState,
      consumables: addConsumables(gameState.consumables, [
        { id: "nails", amount: 1 },
      ]),
      machines: gameState.machines.map((m) => {
        if (!isSameMachine(m, machineState)) {
          return m;
        }
        // Freed boards stay right on the bench: loose stock the next
        // plan can claim, or E takes back into the arms.
        const inputMaterials = [
          ...m.inputMaterials.filter((material) => material !== pallet),
          ...(remainingPallet ? [remainingPallet] : []),
          ...freedBoards,
        ];
        return {
          ...m,
          inputMaterials,
          benchLayout: {
            ...prunedBenchLayout(m.benchLayout, [
              ...inputMaterials,
              ...m.outputMaterials,
            ]),
            ...Object.fromEntries(
              freedBoards.map((freedBoard, i) => [
                freedBoard.id,
                berthPlacementOnBench(
                  palletPlacement,
                  palletBoardSlot(freedRefs[i]),
                ),
              ]),
            ),
          },
        };
      }),
      // The nail's own creak-and-pop; a board settling is part of it.
      pendingSounds: [
        ...(gameState.pendingSounds ?? []),
        { kind: "nail-pry" as const },
      ],
    };
  };
}

/**
 * The tighten-the-last-clamp commit: a clamps-first glue-up claims the
 * very pieces lying in the clamps, in the across order they lie (see
 * bench-work/glue-up.ts — the bench view detects the run; this action
 * trusts the given order the same way a blueprint claim trusts slot
 * order for the driver's unseated path). The composition decides which
 * recipe is credited, exactly as the stock on a direct-feed machine
 * decides the cut. The view follows this with finishAttendedWorkAction —
 * the hand work IS the attended phase — which rolls it into the cure.
 */
export function startGlueUpAction(
  machine: Machine,
  pieceIds: ReadonlyArray<string>,
): GameAction {
  return (gameState) => {
    const machineState = findMachineState(gameState, machine);
    if (!machineState) {
      console.warn("No such bench to glue at");
      return gameState;
    }
    if (machineState.operationProgress.status === "inProgress") {
      console.warn("The bench is mid-operation — no room for a glue-up");
      return gameState;
    }
    if (!attends(gameState, machineState)) {
      console.warn("Can't tighten clamps from across the shop");
      return gameState;
    }
    // The run may include finished work still lying on the bench (a
    // fresh panel going straight into a wider one), same as tool claims
    const bays = [
      ...machineState.inputMaterials,
      ...machineState.outputMaterials,
    ];
    const pieces = pieceIds.map(
      (id) => bays.find((material) => material.id === id) ?? null,
    );
    if (pieces.some((piece) => piece === null) || pieces.length < 2) {
      console.warn("The glue-up names pieces that aren't on the bench");
      return gameState;
    }
    const run = pieces as ReadonlyArray<MaterialInstance>;
    for (const piece of run) {
      const shortfall = gluePrepShortfall(piece);
      if (shortfall) {
        console.warn(`Not glueable: ${shortfall}`);
        return gameState;
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
          span === null ||
          firstSpan === null ||
          Math.abs(span - firstSpan) <= 0.5
        );
      })
    ) {
      console.warn("A glue-up takes one thickness and one length of stock");
      return gameState;
    }
    const operationId = inferGlueOperationId(run);
    if (!operationId) {
      console.warn("Those pieces don't add up to any glue-up");
      return gameState;
    }
    const live = new Machine(machineState);
    const operation = availableOperations(live, gameState.progression).find(
      (op) => op.id === operationId,
    );
    if (!operation) {
      console.warn("That glue-up isn't known at this station yet");
      return gameState;
    }
    // Clamps are borrowed, not spent: this operation starting IS the
    // checkout (the count in use is derived — see Clamp.ts), and the
    // cure finishing is the return.
    if (
      clampsFor(operation, run) >
      clampsFree(gameState.clamps, gameState.machines)
    ) {
      console.warn("Not enough free clamps for a run this long");
      return gameState;
    }
    const [firstPhase] = getOperationPhases(
      operation,
      gameState.progression,
      machineDustMultiplier(gameState.dust, live, gameState.shopInfo.size),
      live.workSpeed,
    );
    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machineState)
          ? {
              ...m,
              selectedOperationId: operationId,
              inputMaterials: m.inputMaterials.filter(
                (material) => !pieceIds.includes(material.id),
              ),
              outputMaterials: m.outputMaterials.filter(
                (material) => !pieceIds.includes(material.id),
              ),
              processingMaterials: [...run],
              operationProgress: {
                status: "inProgress" as const,
                phaseIndex: 0,
                ticksRemaining: firstPhase.duration,
              },
            }
          : m,
      ),
    };
  };
}

/** The layout with entries for departed pieces dropped. */
function prunedBenchLayout(
  layout: Readonly<Record<string, BenchPlacement>> | undefined,
  inputMaterials: ReadonlyArray<{ id: string }>,
): Record<string, BenchPlacement> {
  const pruned: Record<string, BenchPlacement> = {};
  for (const [id, placement] of Object.entries(layout ?? {})) {
    if (inputMaterials.some((material) => material.id === id)) {
      pruned[id] = placement;
    }
  }
  return pruned;
}

/**
 * Commit where a piece lies on the bench top — the drag, turn, or flip
 * the player just made in the bench view. The arrangement is real state
 * (see bench-work/bench-layout.ts), so it survives closing the view and
 * shows on the shop floor too.
 */
export function arrangeBenchMaterialAction(
  machine: Machine,
  materialId: string,
  placement: BenchPlacement,
): GameAction {
  return (gameState) => {
    const machineState = findMachineState(gameState, machine);
    if (!machineState) {
      console.warn("No such bench to arrange");
      return gameState;
    }
    // Finished work lies on the bench too until it's taken, so outputs
    // arrange the same way staged stock does.
    const onBench = [
      ...machineState.inputMaterials,
      ...machineState.outputMaterials,
    ];
    if (!onBench.some((material) => material.id === materialId)) {
      return gameState;
    }
    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machineState)
          ? {
              ...m,
              benchLayout: {
                ...prunedBenchLayout(m.benchLayout, [
                  ...m.inputMaterials,
                  ...m.outputMaterials,
                ]),
                [materialId]: placement,
              },
            }
          : m,
      ),
    };
  };
}

/**
 * Slide pieces off the neighbouring tables onto this one, keeping every
 * one exactly where it physically lies.
 *
 * Tables pushed together work as one bench (bench-work/bench-group.ts),
 * but an operation still consumes from a single machine's bays — so a
 * glue-up whose run straddles a seam, or a build whose parts came off two
 * tables, needs its pieces on one table before it can commit. That's not
 * a workaround, it's what you'd do: slide the parts together, then clamp
 * up. Every commit action downstream is left untouched.
 *
 * Placements are re-measured through the group frame, so nothing appears
 * to move: a board lying across the seam is at the same spot on the floor
 * before and after, it's just bookkept by the other table now.
 */
export function gatherBenchPiecesAction(
  target: Machine,
  pieceIds: ReadonlyArray<string>,
): GameAction {
  return (gameState) => {
    const targetState = findMachineState(gameState, target);
    if (!targetState) {
      console.warn("No such bench to gather onto");
      return gameState;
    }
    const targetMachine = new Machine(targetState);
    const group = benchGroupAt(getMachines(gameState.machines), targetMachine);
    const onto = memberFor(group, targetMachine);
    if (!onto || group.members.length < 2) {
      return gameState;
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
      return gameState;
    }

    const moved = new Set(
      [...takenInputs, ...takenOutputs].map((material) => material.id),
    );
    return {
      ...gameState,
      machines: gameState.machines.map((m) => {
        if (isSameMachine(m, targetState)) {
          const inputMaterials = [...m.inputMaterials, ...takenInputs];
          const outputMaterials = [...m.outputMaterials, ...takenOutputs];
          return {
            ...m,
            inputMaterials,
            outputMaterials,
            benchLayout: {
              ...prunedBenchLayout(m.benchLayout, [
                ...inputMaterials,
                ...outputMaterials,
              ]),
              ...arrivals,
            },
          };
        }
        if (!strippedFrom.has(machineKey(m))) {
          return m;
        }
        const inputMaterials = m.inputMaterials.filter(
          (material) => !moved.has(material.id),
        );
        const outputMaterials = m.outputMaterials.filter(
          (material) => !moved.has(material.id),
        );
        return {
          ...m,
          inputMaterials,
          outputMaterials,
          benchLayout: prunedBenchLayout(m.benchLayout, [
            ...inputMaterials,
            ...outputMaterials,
          ]),
        };
      }),
    };
  };
}

/** How many nails the staged pallet (if any) still has to pry. */
export function palletPryTargetsLeft(machine: Machine): number {
  const pallet = machine.inputMaterials.find(
    (material) => material.type === "pallet",
  );
  if (!pallet || pallet.type !== "pallet") {
    return 0;
  }
  return pallet.nails.length;
}

/**
 * Which interactive script the bench view should run for an operation —
 * null for legacy (attended-tick) operations.
 */
export function interactionFor(
  operation: Operation | null,
): Operation["interaction"] | null {
  return operation?.interaction ?? null;
}

/**
 * How often the bench view lands a dust emission while a stroke is
 * actively moving, so the dust simulation — slowdown, sweeping — stays
 * honest without waiting for the commit.
 */
export const BENCH_DUST_EMISSIONS_PER_SECOND = 2;

/**
 * One throttled emission of hand-work dust: what the tick would have
 * shed over the equivalent stretch of attended machine time (dustOutput
 * is per tick at 5 ticks/second, scaled by the cut load the way
 * machineTickPass scales it). The bench view calls this about twice a
 * second while the tool is moving; sanding a whole board sheds roughly
 * the same total mess either way.
 */
export function emitBenchDustAction(machine: Machine): GameAction {
  return (gameState) => {
    const machineState = findMachineState(gameState, machine);
    if (!machineState) {
      return gameState;
    }
    const live = new Machine(machineState);
    const operation = live.operations.find(
      (op) => op.id === machineState.selectedOperationId,
    );
    const dustOutput = operation?.dustOutput ?? 0;
    if (dustOutput === 0) {
      return gameState;
    }
    const materials =
      machineState.processingMaterials.length > 0
        ? machineState.processingMaterials
        : machineState.inputMaterials;
    const species = [...new Set(materials.flatMap(materialSpecies))];
    if (species.length === 0) {
      return gameState;
    }
    const ticksPerEmission = 5 / BENCH_DUST_EMISSIONS_PER_SECOND;
    return {
      ...gameState,
      dust: emitMachineDust(
        gameState.dust,
        live,
        species,
        dustOutput * deriveMachineCutLoad(live) * ticksPerEmission,
        gameState.shopInfo.size,
      ),
    };
  };
}
