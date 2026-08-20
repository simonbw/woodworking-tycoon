import { stationWorkSpeed } from "../../../game/bench-mounting";
import { machineDustMultiplier } from "../../../game/Dust";
import { Machine } from "../../../game/Machine";
import { getOperationPhases } from "../../../game/skill-helpers";
import { OperationPhase } from "../../../game/Machine";
import { useShopState } from "../../useShell";

/**
 * Live progress of a machine's selected operation, derived once and
 * shared by the sheet header's status line and both sheet bodies'
 * progress bars — so the three can't drift on the phase math. The old
 * hook over the shell's projection.
 */
export interface OperationProgressView {
  /** Effective phases (skill/dust/table speed folded in); [] when idle. */
  readonly phases: ReadonlyArray<OperationPhase>;
  readonly isOperating: boolean;
  /** The running phase, when operating. */
  readonly currentPhase?: OperationPhase;
  /** The attended phase waiting on the player at a boundary, if any. */
  readonly waitingPhase?: OperationPhase;
  /** Ticks left in the current phase. */
  readonly ticksRemaining: number;
  /** 0–1 across the whole operation (later phases counted). */
  readonly progress: number;
}

export function useOperationProgress(machine: Machine): OperationProgressView {
  const gameState = useShopState();

  const operation = machine.selectedOperationOrNull;
  const isOperating = machine.operationProgress.status === "inProgress";
  const phases = operation
    ? getOperationPhases(
        operation,
        gameState.progression,
        machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
        stationWorkSpeed(machine, gameState),
      )
    : [];

  const { phaseIndex, ticksRemaining } = machine.operationProgress;
  const currentPhase = isOperating
    ? phases[Math.min(phaseIndex, phases.length - 1)]
    : undefined;
  const waitingPhase =
    isOperating && ticksRemaining === 0 ? phases[phaseIndex + 1] : undefined;

  const totalDuration = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const ticksLeftOverall = isOperating
    ? ticksRemaining +
      phases
        .slice(phaseIndex + 1)
        .reduce((sum, phase) => sum + phase.duration, 0)
    : 0;
  const progress =
    isOperating && totalDuration > 0
      ? (totalDuration - ticksLeftOverall) / totalDuration
      : 0;

  return {
    phases,
    isOperating,
    currentPhase,
    waitingPhase,
    ticksRemaining,
    progress,
  };
}
