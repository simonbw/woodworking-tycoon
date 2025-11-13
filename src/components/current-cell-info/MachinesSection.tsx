import React from "react";
import { useCellMap } from "../../game/CellMap";
import {
  InputMaterialWithQuantity,
  Machine,
  ParameterValues,
} from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import {
  operateMachineAction,
  setMachineOperationAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import { machineCanOperate } from "../../game/machine-helpers";
import {
  createMockMaterial,
  getMaterialName,
  materialMeetsInput,
} from "../../game/material-helpers";
import {
  executeOperation,
  generateOperationPreview,
  getOperationInputMaterials,
  isParameterizedOperation,
} from "../../game/operation-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialIcon } from "./MaterialIcon";

// Helper to match actual materials to operation requirements
function matchMaterialsToSlots(
  actualMaterials: MaterialInstance[],
  requirements: ReadonlyArray<InputMaterialWithQuantity>
): Array<{
  requirement: InputMaterialWithQuantity;
  material: MaterialInstance;
  isValid: boolean;
  isPlaceholder: boolean;
}> {
  const slots = [];
  const availableMaterials = [...actualMaterials];

  for (const requirement of requirements) {
    for (let i = 0; i < requirement.quantity; i++) {
      // Find a matching material
      const materialIndex = availableMaterials.findIndex((material) =>
        materialMeetsInput(material, requirement)
      );

      if (materialIndex !== -1) {
        // Found a matching material
        const material = availableMaterials[materialIndex];
        availableMaterials.splice(materialIndex, 1);
        slots.push({
          requirement,
          material,
          isValid: true,
          isPlaceholder: false,
        });
      } else {
        // No matching material found - try to find any material for this slot
        const anyMaterialIndex = availableMaterials.findIndex(() => true);
        if (anyMaterialIndex !== -1) {
          // Found a material but it doesn't match requirements
          const material = availableMaterials[anyMaterialIndex];
          availableMaterials.splice(anyMaterialIndex, 1);
          slots.push({
            requirement,
            material,
            isValid: false,
            isPlaceholder: false,
          });
        } else {
          // No material at all - show mock material as placeholder
          slots.push({
            requirement,
            material: createMockMaterial(requirement),
            isValid: false,
            isPlaceholder: true,
          });
        }
      }
    }
  }

  return slots;
}

export const MachinesSection: React.FC = () => {
  const gameState = useGameState();

  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);

  if (!playerCell?.operableMachines.length) {
    return null;
  }

  return (
    <>
      {playerCell.operableMachines.map((machine) => (
        <MachineListItem
          key={machine.type.name + machine.position.join(",")}
          machine={machine}
        />
      ))}
    </>
  );
};

const MachineListItem: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const canOperate = machineCanOperate(machine);
  const isOperating = machine.operationProgress.status === "inProgress";
  const progressPercent = isOperating
    ? ((machine.selectedOperation.duration -
        machine.operationProgress.ticksRemaining) /
        machine.selectedOperation.duration) *
      100
    : 0;

  // Get expected inputs/outputs for the current operation
  const isParamOp = isParameterizedOperation(machine.selectedOperation);

  // Get input requirements and match them to actual materials
  const expectedInputs = getOperationInputMaterials(
    machine.selectedOperation,
    machine.selectedParameters
  );

  const inputSlots = matchMaterialsToSlots(
    [...machine.inputMaterials],
    expectedInputs
  );

  // Calculate expected outputs if we have valid inputs
  let expectedOutputs: readonly MaterialInstance[] = [];
  const allInputsValid = inputSlots.every(
    (slot) => slot.isValid && !slot.isPlaceholder
  );
  if (allInputsValid && inputSlots.length > 0) {
    try {
      const validMaterials = inputSlots
        .filter((slot) => !slot.isPlaceholder)
        .map((slot) => slot.material);
      const result = executeOperation(
        machine.selectedOperation,
        validMaterials,
        machine.selectedParameters
      );
      expectedOutputs = result.outputs;
    } catch (error) {
      // If operation fails, show no preview
      expectedOutputs = [];
    }
  }

  // Always show what the operation would produce using generateOperationPreview
  let previewOutputs: readonly MaterialInstance[] = [];
  if (
    expectedInputs.length > 0 &&
    isParameterizedOperation(machine.selectedOperation)
  ) {
    try {
      const preview = generateOperationPreview(
        machine.selectedOperation,
        machine.selectedParameters || {}
      );
      previewOutputs = preview.expectedOutputs;
    } catch (error) {
      previewOutputs = [];
    }
  }

  return (
    <section className="space-y-1">
      <h3 className="section-heading">{machine.type.name}</h3>
      <select
        value={machine.selectedOperation.id}
        onChange={(event) => {
          const operation = machine.type.operations.find(
            (op) => op.id === event.target.value
          )!;

          // Set default parameters for parameterized operations
          let parameters: ParameterValues | undefined;
          if (isParameterizedOperation(operation)) {
            parameters = {};
            for (const param of operation.parameters) {
              parameters[param.id] = param.values[0];
            }
          }

          applyAction(
            setMachineOperationAction(machine, operation, parameters)
          );
        }}
      >
        {machine.type.operations.map((operation) => (
          <option key={operation.id} value={operation.id}>
            {operation.name}
          </option>
        ))}
      </select>

      {/* Parameter controls for parameterized operations */}
      {isParamOp &&
        machine.selectedOperation.parameters.map((param) => (
          <div key={param.id} className="flex gap-2 items-center">
            <label className="text-xs text-zinc-400">{param.name}:</label>
            <select
              className="text-xs"
              value={machine.selectedParameters?.[param.id] || param.values[0]}
              onChange={(event) => {
                const newParams = {
                  ...machine.selectedParameters,
                  [param.id]: typeof param.values[0] === "number"
                    ? Number(event.target.value)
                    : event.target.value,
                };
                applyAction(
                  setMachineOperationAction(
                    machine,
                    machine.selectedOperation,
                    newParams
                  )
                );
              }}
            >
              {param.values.map((value) => (
                <option key={value} value={value}>
                  {value}
                  {typeof value === "number" ? '"' : ""}
                </option>
              ))}
            </select>
          </div>
        ))}

      {/* Crafting-style slot display */}
      <div className="flex items-center gap-3 p-3 bg-zinc-900 rounded">
        {/* Input slots */}
        <div className="flex gap-1">
          {inputSlots.map((slot, i) => (
            <span
              key={i}
              onClick={() => {
                if (!slot.isPlaceholder) {
                  applyAction(
                    takeInputsFromMachineAction([slot.material], machine)
                  );
                }
              }}
            >
              <MaterialIcon
                material={slot.material}
                placeholder={slot.isPlaceholder}
                isValid={slot.isValid}
                tooltip={
                  slot.isPlaceholder
                    ? `Needs: ${getMaterialName(slot.material)}`
                    : getMaterialName(slot.material)
                }
              />
            </span>
          ))}
          {inputSlots.length === 0 && (
            <MaterialIcon
              material={createMockMaterial({ type: ["board"], quantity: 1 })}
              placeholder={true}
              tooltip="No inputs required"
            />
          )}
        </div>

        <span className="text-zinc-500">→</span>

        {/* Output slots */}
        <div className="flex gap-1">
          {/* Show actual outputs if they exist */}
          {outputMaterials.map(([name, materials]) => (
            <span
              key={name}
              onClick={(event) => {
                if (event.shiftKey) {
                  applyAction(takeOutputsFromMachineAction(materials, machine));
                } else {
                  applyAction(
                    takeOutputsFromMachineAction([materials[0]], machine)
                  );
                }
              }}
            >
              <MaterialIcon
                material={materials[0]}
                quantity={materials.length}
                tooltip={`Ready: ${name}`}
              />
            </span>
          ))}

          {/* Show expected output placeholders when no actual outputs but inputs are valid */}
          {outputMaterials.length === 0 &&
            expectedOutputs.length > 0 &&
            expectedOutputs.map((output, i) => (
              <MaterialIcon
                key={`exact-${i}`}
                material={output}
                placeholder={true}
                tooltip={`Will produce: ${getMaterialName(output)}`}
              />
            ))}

          {/* Show preview placeholders when no actual outputs and no valid inputs */}
          {outputMaterials.length === 0 &&
            expectedOutputs.length === 0 &&
            previewOutputs.map((output, i) => (
              <MaterialIcon
                key={`preview-${i}`}
                material={output}
                placeholder={true}
                tooltip={`Will produce: ${getMaterialName(output)}`}
              />
            ))}

          {/* Show generic placeholder when no outputs at all */}
          {outputMaterials.length === 0 &&
            expectedOutputs.length === 0 &&
            previewOutputs.length === 0 && (
              <MaterialIcon
                material={createMockMaterial({ type: ["board"], quantity: 1 })}
                placeholder={true}
                tooltip="Output will appear here"
              />
            )}
        </div>
      </div>

      {isOperating ? (
        <div className="space-y-1">
          <div className="text-sm text-zinc-400">
            Operating... ({machine.operationProgress.ticksRemaining} ticks
            remaining)
          </div>
          <div className="w-full bg-zinc-700 rounded-full h-2">
            <div
              className="bg-amber-600 h-2 rounded-full transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          className="button"
          disabled={!canOperate}
          onClick={() => applyAction(operateMachineAction(machine))}
        >
          Operate
        </button>
      )}
    </section>
  );
};
