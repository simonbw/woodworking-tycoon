import React from "react";
import { Machine } from "../../game/Machine";
import { useOperationProgress } from "./useOperationProgress";

/** The status wording in the sheet header. */
export const StatusText: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { isOperating, currentPhase, waitingPhase, ticksRemaining } =
    useOperationProgress(machine);
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;
  const operation = machine.selectedOperationOrNull;

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
          {!currentPhase.attended && " (hands-free)"} · {ticksRemaining} ticks
        </span>
      );
    }
    return (
      <span className="text-ink-blue">Running · {ticksRemaining} ticks</span>
    );
  }
  if (switchedOff) return <>Switched off</>;
  if (hasSwitch) return <span className="text-ink-blue">Idling</span>;
  return <>Idle</>;
};
