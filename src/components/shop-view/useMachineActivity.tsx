import { Machine } from "../../game/Machine";
import { playerAttendsMachine } from "../../game/machine-helpers";
import { getOperationPhases } from "../../game/skill-helpers";
import { useGameState } from "../useGameState";

/**
 * Live status of a machine's current operation, shared by the floating
 * badge and the machine sprites' processing-material animations.
 */
export function useMachineActivity(machine: Machine) {
  const gameState = useGameState();
  const progress = machine.operationProgress;
  const operation = machine.selectedOperationOrNull;

  const phases = operation
    ? getOperationPhases(operation, gameState.progression)
    : [];
  const attending = playerAttendsMachine(
    machine,
    gameState.player.position,
    gameState.player.away !== null,
  );

  const isOperating = progress.status === "inProgress" && phases.length > 0;
  // At a boundary (ticksRemaining 0) the phase that matters is the next one
  const relevantPhase = isOperating
    ? progress.ticksRemaining === 0
      ? phases[progress.phaseIndex + 1]
      : phases[Math.min(progress.phaseIndex, phases.length - 1)]
    : undefined;
  const needsYou =
    relevantPhase !== undefined && relevantPhase.attended && !attending;

  const total = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const remaining = isOperating
    ? progress.ticksRemaining +
      phases
        .slice(progress.phaseIndex + 1)
        .reduce((sum, phase) => sum + phase.duration, 0)
    : 0;
  const fraction = total > 0 ? (total - remaining) / total : 0;

  return { isOperating, needsYou, fraction, relevantPhase };
}
