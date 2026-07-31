import React from "react";
import { Machine } from "../../game/Machine";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";

/**
 * The line where a machine's Operate button used to sit. Running a station
 * is a floor verb — stand at it and hold the operate key — so the sheet
 * points at the key instead of duplicating it as a button you could click
 * from across the shop.
 */
export const RunHint: React.FC<{
  machine: Machine;
  canOperate: boolean;
}> = ({ machine, canOperate }) => {
  const { isTargeted } = useTargetedMachine();
  if (!isTargeted(machine)) {
    return null;
  }
  const verb = (machine.type.feedVerb ?? "run").toLowerCase();
  // Name the plan the key would run when the station has one selected;
  // the generic verb covers containers and unset benches.
  const runLabel =
    machine.selectedOperationOrNull?.name.toLowerCase() ?? `${verb} it`;
  return (
    <p className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
      {canOperate ? (
        <>
          <ShortcutKeys shortcut="operate-machine" /> to {runLabel}
        </>
      ) : machine.type.container ? (
        `Nothing to ${verb}`
      ) : (
        `Place stock in the bay to ${verb} it`
      )}
    </p>
  );
};
