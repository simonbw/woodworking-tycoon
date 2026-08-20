import { Game } from "../../core/Game";
import { Machine, machineKey, OperationPhase } from "../../game/Machine";
import { playerAttendsMachine } from "../../game/machine-helpers";
import { deriveMachineVisuals } from "../../game/machine-sound-helpers";
import { operationPhasesNow } from "../../sim/machine-reads";
import { Player } from "../../sim/entities/Player";
import { getAudiblePhase } from "../../utils/machineSoundState";
import { machineHasVoice } from "../../utils/machineVoices";

/**
 * Live status of a machine's current operation, shared by the floating
 * badge and the machine arts' processing animations.
 *
 * `working` and `powered` are the fields to drive visuals from: for a
 * machine with a continuous voice they follow its *audible* phase
 * (`deriveMachineVisuals`), so cut particles and blade shake line up with
 * what the ear hears — the machine spins up before the wood bites and
 * coasts after the operation is done. Machines without a voice follow the
 * operation itself.
 */
export interface MachineActivity {
  isOperating: boolean;
  needsYou: boolean;
  fraction: number;
  relevantPhase: OperationPhase | undefined;
  /** The machine is biting wood — drive cut particles from this. */
  working: boolean;
  /** The motor is on — drive animation/shake from this. */
  powered: boolean;
}

export const IDLE_ACTIVITY: MachineActivity = {
  isOperating: false,
  needsYou: false,
  fraction: 0,
  relevantPhase: undefined,
  working: false,
  powered: false,
};

/**
 * Compute a machine's activity right now. Costs a game-state projection,
 * so callers only pay for machines whose operation is in progress — an
 * idle machine short-circuits, taking only its motor's visuals from the
 * voice (a saw with nothing left to cut is still coasting down, and a
 * switched-on planer still idles).
 */
export function computeMachineActivity(
  game: Game,
  machine: Machine,
): MachineActivity {
  const audiblePhase = machineHasVoice(machine.state.machineTypeId)
    ? getAudiblePhase(machineKey(machine.state))
    : null;

  const progress = machine.operationProgress;
  const operation = machine.selectedOperationOrNull;
  if (progress.status !== "inProgress" || !operation) {
    const visuals = deriveMachineVisuals(audiblePhase, false);
    return visuals.powered ? { ...IDLE_ACTIVITY, ...visuals } : IDLE_ACTIVITY;
  }

  const phases = operationPhasesNow(game, machine, operation);

  // Same rule the tick uses: standing there isn't enough, you have to be
  // holding the operate key too.
  const player = game.entities.getSingleton(Player);
  const attending =
    playerAttendsMachine(machine, player.cell, player.away !== null) &&
    player.operating;

  const isOperating = phases.length > 0;
  // At a boundary (ticksRemaining 0) the phase that matters is the next one
  const relevantPhase = isOperating
    ? progress.ticksRemaining === 0
      ? phases[progress.phaseIndex + 1]
      : phases[Math.min(progress.phaseIndex, phases.length - 1)]
    : undefined;
  // Power-feed operations never wait on the player once running
  const needsYou =
    relevantPhase !== undefined &&
    relevantPhase.attended &&
    !attending &&
    operation.powerFeed !== true;

  const total = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const remaining = isOperating
    ? progress.ticksRemaining +
      phases
        .slice(progress.phaseIndex + 1)
        .reduce((sum, phase) => sum + phase.duration, 0)
    : 0;
  const fraction = total > 0 ? (total - remaining) / total : 0;

  return {
    isOperating,
    needsYou,
    fraction,
    relevantPhase,
    ...deriveMachineVisuals(audiblePhase, isOperating && !needsYou),
  };
}
