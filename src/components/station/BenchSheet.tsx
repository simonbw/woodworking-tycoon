import React from "react";
import { consumableLabel } from "../../game/Consumable";
import {
  setMachineOperationAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import {
  defaultParametersFor,
  Machine,
  Operation,
  operationParameters,
} from "../../game/Machine";
import { machineDustMultiplier } from "../../game/Dust";
import {
  machineCanOperate,
  matchMaterialsToSlots,
  parameterValueSatisfiable,
} from "../../game/machine-helpers";
import { MaterialInstance } from "../../game/Materials";
import { generateOperationPreview } from "../../game/operation-helpers";
import { ModeControl } from "../current-cell-info/ModeControl";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ParameterScaleRow } from "./ParameterScaleRow";
import {
  MachineManualLink,
  MaterialShelf,
  ToolRack,
  UpgradeRack,
} from "./racks";
import { SlotDiagram } from "./SlotDiagram";
import { loadedStockDimension } from "./station-helpers";
import { useOperationProgress } from "./useOperationProgress";
import { VerbRow } from "./VerbRow";

/**
 * Recipe-driven stations (benches, the garbage can): the plan picker,
 * loaded bay, and the tool/upgrade/shelf racks.
 */
export const BenchSheet: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<Operation>;
}> = ({ machine, operations }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();

  const selectedOperation = machine.selectedOperationOrNull;
  const canOperate = machineCanOperate(machine, gameState.consumables);
  const { isOperating, progress } = useOperationProgress(machine);
  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );
  const outputsCollectedHere = machine.type.outputPosition === undefined;

  const expectedInputs = selectedOperation
    ? selectedOperation.getInputMaterials(
        machine.resolvedParameters(selectedOperation),
      )
    : [];
  const inputSlots = matchMaterialsToSlots(
    [...machine.inputMaterials],
    expectedInputs,
  );

  let expectedOutputs: readonly MaterialInstance[] = [];
  const allInputsValid = inputSlots.every(
    (slot) => slot.isValid && !slot.isPlaceholder,
  );
  if (selectedOperation && allInputsValid && inputSlots.length > 0) {
    try {
      const validMaterials = inputSlots
        .filter((slot) => !slot.isPlaceholder)
        .map((slot) => slot.material);
      const result = selectedOperation.output(
        validMaterials,
        machine.resolvedParameters(selectedOperation),
      );
      expectedOutputs = result.outputs;
    } catch (error) {
      expectedOutputs = [];
    }
  }

  let previewOutputs: readonly MaterialInstance[] = [];
  if (
    selectedOperation &&
    expectedInputs.length > 0 &&
    operationParameters(selectedOperation).length > 0
  ) {
    try {
      const preview = generateOperationPreview(
        selectedOperation,
        machine.selectedParameters || {},
      );
      previewOutputs = preview.expectedOutputs;
    } catch (error) {
      previewOutputs = [];
    }
  }

  return (
    <>
      <div className="space-y-2 text-sm">
        <ModeControl
          operations={operations}
          selected={selectedOperation}
          onSelect={(operation) =>
            applyAction(
              setMachineOperationAction(
                machine,
                operation,
                defaultParametersFor(operation),
              ),
            )
          }
          progression={gameState.progression}
          dustMultiplier={dustMultiplier}
          workSpeed={machine.workSpeed}
          showShortcut={isTargeted(machine)}
          // A bench is honestly recipe-driven: you're picking which plan
          // is clipped above it, not flipping a machine mode
          labelText={
            machine.type.worktable ||
            machine.state.machineTypeId === "workspace"
              ? "Plan"
              : "Mode"
          }
        />

        {selectedOperation &&
          operationParameters(selectedOperation).map((param, index) => (
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
                applyAction(
                  setMachineOperationAction(machine, selectedOperation, {
                    ...machine.selectedParameters,
                    [param.id]: value,
                  }),
                )
              }
              satisfiable={(value) =>
                parameterValueSatisfiable(
                  machine,
                  selectedOperation,
                  param.id,
                  value,
                )
              }
              stockValue={loadedStockDimension(machine, param.id)}
            />
          ))}
      </div>

      {/* Supplies drawn from the shop-wide stock when the op starts */}
      {selectedOperation?.requiredConsumables &&
        selectedOperation.requiredConsumables.length > 0 && (
          <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
            Supplies:{" "}
            {selectedOperation.requiredConsumables.map((cost, i) => {
              const stocked = gameState.consumables[cost.id] ?? 0;
              const enough = stocked >= cost.amount;
              const label = consumableLabel(cost);
              return (
                <span key={cost.id}>
                  {i > 0 && " · "}
                  <span className={enough ? "" : "text-store-orange-dark"}>
                    {label} (have {stocked})
                  </span>
                </span>
              );
            })}
          </div>
        )}

      <SlotDiagram
        machine={machine}
        inputSlots={inputSlots}
        expectedOutputs={expectedOutputs}
        previewOutputs={previewOutputs}
      />

      {/* Status lives in the sheet header; this row only offers output
          collection when there's something to collect */}
      {machine.outputMaterials.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-xs font-condensed uppercase tracking-[0.15em] text-ink-fade">
          {outputsCollectedHere ? (
            <button
              className="button-paper text-xs"
              onClick={() =>
                applyAction(
                  takeOutputsFromMachineAction(
                    machine.outputMaterials,
                    machine,
                  ),
                )
              }
            >
              Take All ({machine.outputMaterials.length})
            </button>
          ) : (
            <span className="text-ink-fade">
              Collect at outfeed ({machine.outputMaterials.length})
            </span>
          )}
        </div>
      )}

      <VerbRow
        machine={machine}
        verb="Operate"
        verbTooltip="Operate this machine"
        canAct={canOperate}
        progress={progress}
        isOperating={isOperating}
      />

      <ToolRack machine={machine} />
      <UpgradeRack machine={machine} />
      <MaterialShelf machine={machine} />
      <MachineManualLink machine={machine} />
    </>
  );
};
