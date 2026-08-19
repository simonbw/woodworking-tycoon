import { stationWorkSpeed } from "../bench-mounting";
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
import { isFinishedProduct } from "../material-helpers";
import { getSellValue } from "../material-values";
import { playerAttendsMachine } from "../machine-helpers";
import { getOperationPhases } from "../skill-helpers";
import { SoundEvent } from "../SoundEvent";
import { UpgradeId } from "../Upgrade";
import { Vector } from "../Vectors";
import { deliverMachineCrate, freshMachineState } from "./machine-actions";
import { withXp } from "./skill-actions";
import { MaterialInstance } from "../Materials";
import {
  BenchPlacement,
  defaultBenchPlacement,
} from "../bench-work/bench-layout";

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
      stationWorkSpeed(live, gameState),
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

/** The layout with entries for departed pieces dropped. */
export function prunedBenchLayout(
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
 * How often the bench view lands a dust emission while a stroke is
 * actively moving, so the dust simulation — slowdown, sweeping — stays
 * honest without waiting for the commit.
 */
export const BENCH_DUST_EMISSIONS_PER_SECOND = 2;
