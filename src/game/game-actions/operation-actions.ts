import { addConsumables, ConsumableAmount } from "../Consumable";
import { machineDustMultiplier } from "../Dust";
import { GameAction, GameState } from "../GameState";
import {
  isSameMachine,
  Machine,
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
import { PryTarget } from "../bench-work/workpiece";
import { deriveMachineCutLoad } from "../cut-load";
import { emitMachineDust } from "../Dust";
import { materialSpecies } from "../material-helpers";

/**
 * The commit-action split (see docs/bench-minigames.md): the bench view
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
 * incremental commits. Every pull is real state: the nail lands in the
 * shop's stock immediately, the pallet's own board flags update on the
 * MaterialInstance, and the freed board stays lying on the bench (it
 * joins inputMaterials, where the next recipe's stagedPieces will find
 * it). Refresh mid-dismantle and you resume at the exact nail you left,
 * not because mini-game state was saved, but because every pull WAS game
 * state.
 *
 * Deck boards come off first (top of the stack down), one nail each; then
 * the three stringers, one nail each — the same 14-nail, 11-board yield
 * the one-shot recipe paid out. The bench view passes the nail the
 * player actually pried; without one, the topmost remaining board frees
 * (the driver's path).
 */
export function pryPalletNailAction(
  machine: Machine,
  target?: PryTarget,
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

    const deckIndex =
      target?.kind === "deck" && pallet.deckBoards[target.index]
        ? target.index
        : target?.kind === "stringer"
          ? -1
          : pallet.deckBoards.findLastIndex((b: boolean) => b);
    let remainingPallet: typeof pallet | null;
    let freedBoard;
    if (deckIndex !== -1) {
      const deckBoards = [...pallet.deckBoards] as typeof pallet.deckBoards;
      deckBoards[deckIndex] = false;
      remainingPallet = { ...pallet, deckBoards };
      freedBoard = board("pallet", 3, 4, 1);
    } else if (pallet.stringerBoardsLeft > 0) {
      remainingPallet =
        pallet.stringerBoardsLeft > 1
          ? { ...pallet, stringerBoardsLeft: pallet.stringerBoardsLeft - 1 }
          : null;
      freedBoard = board("pallet", 4, 6, 3);
    } else {
      console.warn("Nothing left on the pallet to pry");
      return gameState;
    }

    return {
      ...gameState,
      consumables: addConsumables(gameState.consumables, [
        { id: "nails", amount: 1 },
      ]),
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machineState)
          ? {
              ...m,
              // The freed board stays right on the bench: loose stock the
              // next plan can claim, or E takes back into the arms.
              inputMaterials: [
                ...m.inputMaterials.filter((material) => material !== pallet),
                ...(remainingPallet ? [remainingPallet] : []),
                freedBoard,
              ],
            }
          : m,
      ),
      // The nail's own creak-and-pop; the board settling is part of it.
      pendingSounds: [
        ...(gameState.pendingSounds ?? []),
        { kind: "nail-pry" as const },
      ],
    };
  };
}

/** True when the staged pallet (if any) still has a nail to pry. */
export function palletPryTargetsLeft(machine: Machine): number {
  const pallet = machine.inputMaterials.find(
    (material) => material.type === "pallet",
  );
  if (!pallet || pallet.type !== "pallet") {
    return 0;
  }
  return (
    pallet.deckBoards.filter((b: boolean) => b).length +
    pallet.stringerBoardsLeft
  );
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
