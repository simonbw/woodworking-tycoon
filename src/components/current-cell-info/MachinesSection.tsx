import React from "react";
import { useCellMap } from "../../game/CellMap";
import { Machine, ParameterValues } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import {
  operateMachineAction,
  setMachineOperationAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import {
  machineCanOperate,
  matchMaterialsToSlots,
} from "../../game/machine-helpers";
import {
  createMockMaterial,
  getMaterialName,
} from "../../game/material-helpers";
import {
  executeOperation,
  generateOperationPreview,
  getOperationInputMaterials,
  isParameterizedOperation,
} from "../../game/operation-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ProgressButton } from "../ProgressButton";
import { MaterialIcon } from "./MaterialIcon";

export const MachinesSection: React.FC = () => {
  const gameState = useGameState();

  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);

  if (!playerCell?.operableMachines.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      {playerCell.operableMachines.map((machine) => (
        <MachineSpecSheet
          key={machine.type.name + machine.position.join(",")}
          machine={machine}
        />
      ))}
    </div>
  );
};

const MachineSpecSheet: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialName(material),
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

  const isParamOp = isParameterizedOperation(machine.selectedOperation);

  const expectedInputs = getOperationInputMaterials(
    machine.selectedOperation,
    machine.selectedParameters,
  );

  const inputSlots = matchMaterialsToSlots(
    [...machine.inputMaterials],
    expectedInputs,
  );

  let expectedOutputs: readonly MaterialInstance[] = [];
  const allInputsValid = inputSlots.every(
    (slot) => slot.isValid && !slot.isPlaceholder,
  );
  if (allInputsValid && inputSlots.length > 0) {
    try {
      const validMaterials = inputSlots
        .filter((slot) => !slot.isPlaceholder)
        .map((slot) => slot.material);
      const result = executeOperation(
        machine.selectedOperation,
        validMaterials,
        machine.selectedParameters,
      );
      expectedOutputs = result.outputs;
    } catch (error) {
      expectedOutputs = [];
    }
  }

  let previewOutputs: readonly MaterialInstance[] = [];
  if (
    expectedInputs.length > 0 &&
    isParameterizedOperation(machine.selectedOperation)
  ) {
    try {
      const preview = generateOperationPreview(
        machine.selectedOperation,
        machine.selectedParameters || {},
      );
      previewOutputs = preview.expectedOutputs;
    } catch (error) {
      previewOutputs = [];
    }
  }

  return (
    <section className="paper-card space-y-3">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-stencil text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Spec Sheet
        </span>
      </header>

      <div className="space-y-2 text-sm">
        <label className="flex flex-row items-center gap-2">
          <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16">
            Mode
          </span>
          <select
            className="bg-paper-ivory text-ink-black border border-ink-black/30 px-2 py-0.5 rounded font-condensed grow"
            value={machine.selectedOperation.id}
            onChange={(event) => {
              const operation = machine.type.operations.find(
                (op) => op.id === event.target.value,
              )!;

              let parameters: ParameterValues | undefined;
              if (isParameterizedOperation(operation)) {
                parameters = {};
                for (const param of operation.parameters) {
                  parameters[param.id] = param.values[0];
                }
              }

              applyAction(
                setMachineOperationAction(machine, operation, parameters),
              );
            }}
          >
            {machine.type.operations.map((operation) => (
              <option key={operation.id} value={operation.id}>
                {operation.name}
              </option>
            ))}
          </select>
        </label>

        {isParamOp &&
          machine.selectedOperation.parameters.map((param) => (
            <label
              key={param.id}
              className="flex flex-row items-center gap-2 text-xs"
            >
              <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16">
                {param.name}
              </span>
              <select
                className="bg-paper-ivory text-ink-black border border-ink-black/30 px-2 py-0.5 rounded font-condensed grow"
                value={machine.selectedParameters?.[param.id] || param.values[0]}
                onChange={(event) => {
                  const newParams = {
                    ...machine.selectedParameters,
                    [param.id]:
                      typeof param.values[0] === "number"
                        ? Number(event.target.value)
                        : event.target.value,
                  };
                  applyAction(
                    setMachineOperationAction(
                      machine,
                      machine.selectedOperation,
                      newParams,
                    ),
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
            </label>
          ))}
      </div>

      {/* Slot diagram — inset bay with darker frame */}
      <div className="flex items-center gap-3 p-3 bg-workshop-panel/15 border border-ink-black/20 rounded">
        <div className="flex gap-1">
          {inputSlots.map((slot, i) => (
            <span
              key={i}
              onClick={() => {
                if (!slot.isPlaceholder) {
                  applyAction(
                    takeInputsFromMachineAction([slot.material], machine),
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

        <span className="font-mono text-ink-fade text-lg">→</span>

        <div className="flex gap-1">
          {outputMaterials.map(([name, materials]) => (
            <span
              key={name}
              onClick={(event) => {
                if (event.shiftKey) {
                  applyAction(takeOutputsFromMachineAction(materials, machine));
                } else {
                  applyAction(
                    takeOutputsFromMachineAction([materials[0]], machine),
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

      <div className="flex items-center justify-between gap-2 text-xs font-condensed uppercase tracking-[0.15em] text-ink-fade">
        <span>
          Status:{" "}
          {isOperating ? (
            <span className="text-ink-blue">
              Running · {machine.operationProgress.ticksRemaining} ticks
            </span>
          ) : (
            "Idle"
          )}
        </span>
        {machine.outputMaterials.length > 0 && (
          <button
            className="button-paper text-xs"
            onClick={() =>
              applyAction(
                takeOutputsFromMachineAction(machine.outputMaterials, machine),
              )
            }
          >
            Take All ({machine.outputMaterials.length})
          </button>
        )}
      </div>

      <ProgressButton
        progress={progressPercent / 100}
        disabled={!canOperate}
        onClick={() => applyAction(operateMachineAction(machine))}
      >
        {isOperating ? "Operating..." : "Operate"}
      </ProgressButton>
    </section>
  );
};
