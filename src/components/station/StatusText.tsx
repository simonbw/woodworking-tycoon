import React from "react";
import { Machine } from "../../game/Machine";
import { formatDuration } from "../../game/time";
import { useOperationProgress } from "./useOperationProgress";

/** The status wording in the sheet header. */
export const StatusText: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { isOperating, currentPhase, waitingPhase, ticksRemaining } =
    useOperationProgress(machine);
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;
  const operation = machine.selectedOperationOrNull;

  // A phase with nothing left on it wraps up this tick — there's no span of
  // time left to name, so say what it's doing instead of counting zero.
  const timeLeft =
    ticksRemaining === 0
      ? "finishing"
      : `${formatDuration(ticksRemaining)} left`;

  if (isOperating) {
    if (switchedOff) {
      return (
        <span className="text-store-orange-dark">Paused · switched off</span>
      );
    }
    if (waitingPhase) {
      return (
        <span className="text-store-orange-dark">
          Ready · {waitingPhase.name} needs you
        </span>
      );
    }
    if (operation?.phases && currentPhase) {
      return (
        <span className="text-ink-blue">
          {currentPhase.name}
          {!currentPhase.attended && " (hands-free)"} · {timeLeft}
        </span>
      );
    }
    return (
      <span className="text-ink-blue">Running · {timeLeft}</span>
    );
  }
  if (switchedOff) return <>Switched off</>;
  if (hasSwitch) return <span className="text-ink-blue">Idling</span>;
  return <>Idle</>;
};
