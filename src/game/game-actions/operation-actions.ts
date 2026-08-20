import { ConsumableAmount } from "../Consumable";
import { Machine, MachineId, MachineState, Operation } from "../Machine";
import { isFinishedProduct } from "../material-helpers";
import { getSellValue } from "../material-values";
import { SoundEvent } from "../SoundEvent";
import { UpgradeId } from "../Upgrade";
import { Vector } from "../Vectors";
import { MaterialInstance } from "../Materials";
import {
  BenchPlacement,
  defaultBenchPlacement,
} from "../bench-work/bench-layout";

/**
 * What a finished operation does to the shop, worked out as pure rules
 * (see docs/bench-work.md for the split: the bench view decides *when*,
 * these decide *what*).
 *
 * `completeOperation` stages a completion — the machine after the work
 * comes off, plus everything the operation earned — without touching the
 * world. Landing that staged batch belongs to `sim/systems/grants.ts`.
 * Both the machine tick (`sim/systems/MachineSystem.ts`) and the bench
 * view's finish commit (`sim/commands/machine-commands.ts`) run this same
 * function, so a tick-completed cut and a hand-finished sanding pass are
 * indistinguishable in what they do to the shop.
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
