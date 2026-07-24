import React from "react";
import { setMachineSettingsAction } from "../../game/game-actions/player-actions";
import {
  Machine,
  Operation,
  OperationParameter,
  operationParameters,
} from "../../game/Machine";
import {
  explainFeedRefusal,
  machineCanOperate,
  parameterValueSatisfiable,
  slideStock,
} from "../../game/machine-helpers";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ParameterScaleRow } from "./ParameterScaleRow";
import { MachineManualLink, ToolRack } from "./racks";
import { stockDimension } from "./station-helpers";
import { useOperationProgress } from "./useOperationProgress";
import { OutputsRow, VerbRow } from "./VerbRow";

/**
 * Direct-feed machines: the machine's own physical controls — settings
 * scales, the switch, and stock presented from your hands. Which
 * operation runs is decided by what you carry.
 */
export const DirectFeedSheet: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<Operation>;
}> = ({ machine, operations }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();

  const carried = gameState.player.inventory;
  const verb = machine.type.feedVerb ?? "Feed";

  // The machine's settings rack: every scale any of its operations reads,
  // each shown once. The owning operation drives the reachability marks.
  const settings: Array<{
    param: OperationParameter;
    operation: Operation;
  }> = [];
  for (const op of operations) {
    for (const param of operationParameters(op)) {
      if (!settings.some((s) => s.param.id === param.id)) {
        settings.push({ param, operation: op });
      }
    }
  }

  const { isOperating, progress } = useOperationProgress(machine);
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;
  const canFeed =
    !isOperating &&
    machineCanOperate(
      machine,
      gameState.consumables,
      carried,
      gameState.progression,
    );
  // Why the machine won't take what's in hand — the teaching moment.
  // Power problems trump stock problems, so a switched-off machine keeps
  // its "switch on first" line instead.
  const refusal =
    !isOperating && !canFeed && !switchedOff
      ? explainFeedRefusal(machine, operations, carried, gameState.consumables)
      : null;

  return (
    <>
      {settings.map(({ param, operation }, index) => (
        <ParameterScaleRow
          key={param.id}
          param={param}
          value={
            machine.selectedParameters?.[param.id] ??
            param.defaultValue ??
            param.values[0]
          }
          showShortcut={index === 0 && isTargeted(machine)}
          onSelect={(value) =>
            applyAction(setMachineSettingsAction(machine, { [param.id]: value }))
          }
          satisfiable={(value) =>
            parameterValueSatisfiable(machine, operation, param.id, value, carried)
          }
          board={slideStock(machine, operations, carried)}
          angle={Number(machine.selectedParameters?.angle ?? 0)}
          stockValue={carried
            .map((material) => stockDimension(material, param.id))
            .find((value) => value !== undefined)}
        />
      ))}

      <VerbRow
        machine={machine}
        verb={verb}
        verbTooltip={
          isOperating || canFeed
            ? `${verb} the carried stock`
            : (refusal ?? "Carry stock the machine is set up to take")
        }
        canAct={canFeed}
        progress={progress}
        isOperating={isOperating}
      />

      {/* The machine explains itself: with stock in hand it won't take,
          the specific blocker shows as a penciled note under the button */}
      {refusal && carried.length > 0 && (
        <p className="text-[0.65rem] italic leading-snug text-ink-fade">
          {refusal}
        </p>
      )}

      <OutputsRow machine={machine} />

      <ToolRack machine={machine} />
      <p className="text-xs italic text-ink-fade">{machine.type.description}</p>
      <MachineManualLink machine={machine} />
    </>
  );
};
