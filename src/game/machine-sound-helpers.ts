import { ProgressionState } from "./GameState";
import { Machine, MachineId } from "./Machine";
import { playerAttendsMachine } from "./machine-helpers";
import { MaterialInstance, panelWidth } from "./Materials";
import { getOperationPhases } from "./skill-helpers";
import { Vector } from "./Vectors";

/**
 * The audible state of a machine, derived fresh from game state every frame
 * (see `MachineSoundLayer`). Deriving rather than listening for start/stop
 * events means the sound is always consistent with the simulation — an
 * operation that pauses when the player walks off, resumes, or comes back
 * from a save reload just sounds right, with no events to miss.
 *
 *  - "off":     nothing in progress (or a hands-free phase like glue curing)
 *  - "running": in progress but not cutting — the player stepped away
 *               mid-operation or the machine is waiting at a phase boundary,
 *               so the motor idles
 *  - "cutting": an attended phase is actively ticking
 */
export type MachineSoundPhase = "off" | "running" | "cutting";

export function deriveMachineSoundPhase(
  machine: Machine,
  playerPosition: Vector,
  playerIsAway: boolean,
  progression: ProgressionState,
): MachineSoundPhase {
  const progress = machine.operationProgress;
  if (progress.status !== "inProgress") {
    return "off";
  }
  const operation = machine.selectedOperationOrNull;
  if (!operation) {
    return "off";
  }

  // Waiting at a phase boundary for the player: the motor idles until they
  // come back to feed the next pass.
  if (progress.ticksRemaining === 0) {
    return "running";
  }

  const phases = getOperationPhases(operation, progression);
  const phase = phases[Math.min(progress.phaseIndex, phases.length - 1)];

  // Hands-free phases (glue curing) make no machine noise.
  if (!phase.attended) {
    return "off";
  }

  return playerAttendsMachine(machine, playerPosition, playerIsAway)
    ? "cutting"
    : "running";
}

/**
 * How hard the machine works for the stock it's cutting, as a strain scalar
 * the synth scales its bog/boosts by: 1 is the reference tuning (a healthy
 * cut of mid-heavy stock), light stock relaxes toward the floor, and the
 * beefiest stock caps out a third above reference. Which dimension strains
 * the machine differs per machine: a planer/jointer spans the WIDTH with its
 * knives, a table saw rips through the THICKNESS, and a miter saw chops the
 * whole cross-section (geometric mean, so both dimensions matter equally).
 */
export function deriveMachineCutLoad(machine: Machine): number {
  // Mid-operation the stock lives in processing; before the first tick it
  // may still be waiting on the infeed.
  const stock =
    machine.processingMaterials.length > 0
      ? machine.processingMaterials
      : machine.inputMaterials;
  const ratios = stock
    .map((material) => loadRatio(machine.state.machineTypeId, material))
    .filter((ratio): ratio is number => ratio !== null);
  if (ratios.length === 0) {
    return 1;
  }
  return Math.min(1.3, Math.max(0.4, Math.max(...ratios)));
}

/** Stock dimensions at which the load ratio is exactly 1. */
const REFERENCE_WIDTH_IN = 5;
const REFERENCE_THICKNESS_IN = 1.25;

function loadRatio(
  machineTypeId: MachineId,
  material: MaterialInstance,
): number | null {
  const section = cutSection(material);
  if (!section) {
    return null;
  }
  switch (machineTypeId) {
    case "lunchboxPlaner":
    case "jointer":
      return section.widthIn / REFERENCE_WIDTH_IN;
    case "jobsiteTableSaw":
      return section.thicknessIn / REFERENCE_THICKNESS_IN;
    case "miterSaw":
      return Math.sqrt(
        (section.widthIn / REFERENCE_WIDTH_IN) *
          (section.thicknessIn / REFERENCE_THICKNESS_IN),
      );
    default:
      return null;
  }
}

/** The cross-section the cutter meets, in inches (thickness is stored in quarters). */
function cutSection(
  material: MaterialInstance,
): { widthIn: number; thicknessIn: number } | null {
  switch (material.type) {
    case "board":
      return { widthIn: material.width, thicknessIn: material.thickness / 4 };
    case "panel":
      return {
        widthIn: panelWidth(material),
        thicknessIn: material.thickness / 4,
      };
    case "plywood":
      return { widthIn: material.width, thicknessIn: material.thickness / 4 };
    default:
      return null;
  }
}
