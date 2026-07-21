import { machineDustMultiplier } from "../../game/Dust";
import { Machine } from "../../game/Machine";
import { playerAttendsMachine } from "../../game/machine-helpers";
import { getOperationPhases } from "../../game/skill-helpers";
import { useAudiblePhase } from "../../utils/machineSoundState";
import { machineHasVoice, machineKey } from "../MachineSoundLayer";
import { useGameState } from "../useGameState";

/**
 * Live status of a machine's current operation, shared by the floating
 * badge and the machine sprites' processing-material animations.
 *
 * `working` and `powered` are the fields to drive visuals from: for machines
 * with a continuous voice they follow the machine's *audible* phase, so cut
 * particles and blade animation line up with what the ear hears — the
 * machine idles through the sound layer's lead-in/lead-out even while the
 * game already counts the operation as underway. Machines without a voice
 * fall back to the game-state approximation.
 */
export function useMachineActivity(machine: Machine) {
  const gameState = useGameState();
  const progress = machine.operationProgress;
  const operation = machine.selectedOperationOrNull;

  const phases = operation
    ? getOperationPhases(
        operation,
        gameState.progression,
        machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
        machine.workSpeed,
      )
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

  const audiblePhase = useAudiblePhase(machineKey(machine.state));
  const hasVoice = machineHasVoice(machine.state.machineTypeId);
  /** The machine is audibly biting wood — drive cut particles from this. */
  const working = hasVoice
    ? audiblePhase === "cutting"
    : isOperating && !needsYou;
  /** The motor is audibly on (incl. spin-up idle) — drive animation/shake. */
  const powered = hasVoice ? audiblePhase !== "off" : working;

  return { isOperating, needsYou, fraction, relevantPhase, working, powered };
}
