import React from "react";
import {
  operateMachineAction,
  takeOutputsFromMachineAction,
  toggleMachinePowerAction,
} from "../../game/game-actions/player-actions";
import { Machine } from "../../game/Machine";
import { getMaterialFullName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { ProgressButton } from "../ProgressButton";
import { Tooltip } from "../Tooltip";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useApplyGameAction } from "../useGameState";

/** The power switch + main verb button row. */
export const VerbRow: React.FC<{
  machine: Machine;
  verb: string;
  verbTooltip: React.ReactNode;
  canAct: boolean;
  progress: number;
  isOperating: boolean;
}> = ({ machine, verb, verbTooltip, canAct, progress, isOperating }) => {
  const applyAction = useApplyGameAction();
  const { isTargeted } = useTargetedMachine();
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;

  return (
    <div className="flex items-stretch gap-2">
      {hasSwitch && (
        <Tooltip
          content={switchedOff ? "Flip the power on" : "Shut the machine down"}
          shortcut={isTargeted(machine) ? "power-toggle" : undefined}
        >
          <button
            className={
              "button-paper text-xs whitespace-nowrap shrink-0" +
              (!switchedOff ? " text-ink-blue" : "")
            }
            onClick={() => applyAction(toggleMachinePowerAction(machine))}
          >
            {switchedOff ? "Switch On" : "Switch Off"}
          </button>
        </Tooltip>
      )}
      <Tooltip
        content={switchedOff ? "Switch the machine on first" : verbTooltip}
        shortcut={
          isTargeted(machine) && !switchedOff ? "operate-machine" : undefined
        }
      >
        <ProgressButton
          progress={progress}
          disabled={!canAct || switchedOff}
          onClick={() => applyAction(operateMachineAction(machine))}
        >
          {isOperating ? `${verb.replace(/e$/, "")}ing...` : verb}
        </ProgressButton>
      </Tooltip>
    </div>
  );
};

/** Finished pieces waiting on a single-point station, taken right here. */
export const OutputsRow: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const outputsCollectedHere = machine.type.outputPosition === undefined;

  if (machine.outputMaterials.length === 0) return null;
  if (!outputsCollectedHere) {
    return (
      <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        Collect at outfeed ({machine.outputMaterials.length})
      </div>
    );
  }

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1">
        {outputMaterials.map(([name, materials]) => (
          <span
            key={name}
            onClick={(event) => {
              applyAction(
                takeOutputsFromMachineAction(
                  event.shiftKey ? materials : [materials[0]],
                  machine,
                ),
              );
            }}
          >
            <MaterialIcon
              material={materials[0]}
              quantity={materials.length}
              tooltip={`Take: ${name}`}
            />
          </span>
        ))}
      </div>
      <button
        className="button-paper text-xs whitespace-nowrap"
        onClick={() =>
          applyAction(
            takeOutputsFromMachineAction(machine.outputMaterials, machine),
          )
        }
      >
        Take All ({machine.outputMaterials.length})
      </button>
    </div>
  );
};
