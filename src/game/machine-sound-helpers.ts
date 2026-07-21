import { ProgressionState } from "./GameState";
import { Machine } from "./Machine";
import { playerAttendsMachine } from "./machine-helpers";
import { getOperationPhases } from "./skill-helpers";
import { Vector } from "./Vectors";

/**
 * The audible state of a machine, derived fresh from game state every frame
 * (see `MachineSoundLayer`). Deriving rather than listening for start/stop
 * events means the sound is always consistent with the simulation — an
 * operation that pauses when the player walks off, resumes, or comes back
 * from a save reload just sounds right, with no events to miss.
 *
 *  - "off":     no power — nothing in progress (or a hands-free phase like
 *               glue curing), or the machine's power switch is off
 *  - "running": the motor idles — a switched machine is on but not biting
 *               wood, the player stepped away mid-operation, or the machine
 *               is waiting at a phase boundary
 *  - "cutting": an attended phase is actively ticking
 */
export type MachineSoundPhase = "off" | "running" | "cutting";

export function deriveMachineSoundPhase(
  machine: Machine,
  playerPosition: Vector,
  playerIsAway: boolean,
  progression: ProgressionState,
): MachineSoundPhase {
  // A machine with a power switch is audible from the switch, not the work:
  // off is silent even mid-operation (the cut is paused), and on means the
  // motor idles between cuts — the running sound is what reminds the player
  // they left the planer on.
  const switched = machine.type.powerSwitch === true;
  if (switched && !machine.isPowered) {
    return "off";
  }
  const idle: MachineSoundPhase = switched ? "running" : "off";

  const progress = machine.operationProgress;
  if (progress.status !== "inProgress") {
    return idle;
  }
  const operation = machine.selectedOperationOrNull;
  if (!operation) {
    return idle;
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
    return idle;
  }

  // Power feed keeps cutting (and screaming) with nobody standing there.
  return operation.powerFeed ||
    playerAttendsMachine(machine, playerPosition, playerIsAway)
    ? "cutting"
    : "running";
}
