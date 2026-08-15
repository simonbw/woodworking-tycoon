import { Game } from "../../core/Game";
import { stationWorkSpeed } from "../../game/bench-mounting";
import { machineDustMultiplier } from "../../game/Dust";
import { Machine, OperationPhase } from "../../game/Machine";
import { playerAttendsMachine } from "../../game/machine-helpers";
import { getOperationPhases } from "../../game/skill-helpers";
import { Player } from "../../sim/entities/Player";
import { projectGameState } from "../../sim/projection";

/**
 * Live status of a machine's current operation — the old
 * `useMachineActivity` hook, recomputed from the entity world instead of
 * React state. Shared by the floating badge and the machine arts'
 * processing animations.
 *
 * The old hook let machines with a continuous voice follow their
 * *audible* phase, so particles and blade shake lined up with the sound
 * layer's lead-in/lead-out. The sound layers arrive at cutover (phase 8),
 * so until then every machine uses the hook's no-voice fallback: visuals
 * follow the game state directly.
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
 * idle machine short-circuits to `IDLE_ACTIVITY`.
 */
export function computeMachineActivity(
  game: Game,
  machine: Machine,
): MachineActivity {
  const progress = machine.operationProgress;
  const operation = machine.selectedOperationOrNull;
  if (progress.status !== "inProgress" || !operation) {
    return IDLE_ACTIVITY;
  }

  const gameState = projectGameState(game);
  const phases = getOperationPhases(
    operation,
    gameState.progression,
    machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
    stationWorkSpeed(machine, gameState),
  );

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

  const working = isOperating && !needsYou;
  return {
    isOperating,
    needsYou,
    fraction,
    relevantPhase,
    working,
    powered: working,
  };
}
