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
  mountToolAction,
  unmountToolAction,
} from "../../game/game-actions/tool-actions";
import {
  availableOperations,
  getOperationDuration,
} from "../../game/skill-helpers";
import { TOOL_TYPES } from "../../game/Tool";
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
import { classNames } from "../../utils/classNames";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ProgressButton } from "../ProgressButton";
import { MaterialIcon } from "./MaterialIcon";

export const MachinesSection: React.FC = () => {
  const gameState = useGameState();
  const { machines, isTargeted } = useTargetedMachine();

  // The player can't work machines while out of the shop
  if (gameState.player.away || machines.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {machines.map((machine) => (
        <div
          key={machine.type.name + machine.position.join(",")}
          // With only one machine here the keys are unambiguous, so the
          // targeting outline would just be noise.
          className={classNames(
            "rounded-sm",
            machines.length > 1 &&
              isTargeted(machine) &&
              "ring-2 ring-ink-blue/60 ring-offset-2 ring-offset-workshop-bg",
          )}
        >
          {machines.length > 1 && isTargeted(machine) && (
            <div className="flex items-center gap-1.5 pb-1 font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-ink-blue">
              <ShortcutKeys shortcut="cycle-machine" />
              <span>keys act on this one</span>
            </div>
          )}
          <MachineSpecSheet machine={machine} />
        </div>
      ))}
    </div>
  );
};

const MachineSpecSheet: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();

  // Only skill-unlocked recipes appear at the station; locked ones live on
  // the Skills page. Stations with nothing usable (e.g. the sales table)
  // get a simple contents card instead of the operation spec sheet.
  const operations = availableOperations(machine, gameState.progression);
  if (operations.length === 0) {
    return <OperationlessMachineCard machine={machine} />;
  }

  // Null when nothing is selected yet (e.g. a freshly-placed station whose
  // only recipes came from tools)
  const selectedOperation = machine.selectedOperationOrNull;

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const canOperate = machineCanOperate(machine);
  const isOperating = machine.operationProgress.status === "inProgress";
  const effectiveDuration = selectedOperation
    ? getOperationDuration(selectedOperation, gameState.progression)
    : 0;
  const progressPercent =
    isOperating && selectedOperation
      ? ((effectiveDuration - machine.operationProgress.ticksRemaining) /
          effectiveDuration) *
        100
      : 0;

  const expectedInputs = selectedOperation
    ? getOperationInputMaterials(selectedOperation, machine.selectedParameters)
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
      const result = executeOperation(
        selectedOperation,
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
    selectedOperation &&
    expectedInputs.length > 0 &&
    isParameterizedOperation(selectedOperation)
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
            value={selectedOperation?.id ?? ""}
            onChange={(event) => {
              const operation = operations.find(
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
            {!selectedOperation && (
              <option value="" disabled>
                Select mode…
              </option>
            )}
            {operations.map((operation) => (
              <option key={operation.id} value={operation.id}>
                {operation.name}
              </option>
            ))}
          </select>
        </label>

        {selectedOperation &&
          isParameterizedOperation(selectedOperation) &&
          selectedOperation.parameters.map((param) => (
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
                      selectedOperation,
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

      <ToolRack machine={machine} />

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

      <Tooltip
        content="Operate this machine"
        shortcut={isTargeted(machine) ? "operate-machine" : undefined}
      >
        <ProgressButton
          progress={progressPercent / 100}
          disabled={!canOperate}
          onClick={() => applyAction(operateMachineAction(machine))}
        >
          {isOperating ? "Operating..." : "Operate"}
        </ProgressButton>
      </Tooltip>
    </section>
  );
};

/**
 * Tool slots on a workstation: mounted tools can be removed to storage,
 * and stored tools can be mounted while slots are free. Mounting a tool
 * adds its operations to the station's Mode list.
 */
const ToolRack: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (machine.type.toolSlots === 0) {
    return null;
  }

  const freeSlots = machine.type.toolSlots - machine.state.tools.length;

  return (
    <div className="space-y-1">
      <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        Tools · {machine.state.tools.length}/{machine.type.toolSlots} slots
      </div>
      <ul className="divide-y divide-ink-black/15 text-sm">
        {machine.state.tools.map((toolId, index) => (
          <li
            key={`${toolId}-${index}`}
            className="flex items-center gap-2 py-1"
          >
            <span className="grow">{TOOL_TYPES[toolId].name}</span>
            <button
              className="button-paper text-xs"
              onClick={() => applyAction(unmountToolAction(machine, toolId))}
            >
              Remove
            </button>
          </li>
        ))}
        {freeSlots > 0 &&
          gameState.storage.tools.map((toolId, index) => (
            <li
              key={`stored-${toolId}-${index}`}
              className="flex items-center gap-2 py-1 text-ink-fade"
            >
              <span className="grow">{TOOL_TYPES[toolId].name} (stored)</span>
              <button
                className="button-paper text-xs"
                onClick={() => applyAction(mountToolAction(machine, toolId))}
              >
                Attach
              </button>
            </li>
          ))}
        {machine.state.tools.length === 0 &&
          gameState.storage.tools.length === 0 && (
            <li className="py-1 italic text-ink-fade text-xs">
              No tools yet — check the store's tool wall.
            </li>
          )}
      </ul>
    </div>
  );
};

/** Card for machines with no operations, like the sales table: just show
 * what's on it and let the player take things back. */
const OperationlessMachineCard: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const applyAction = useApplyGameAction();

  const groupedContents = [
    ...groupBy(machine.inputMaterials, (material) =>
      getMaterialName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-3">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-stencil text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Contents
        </span>
      </header>
      <ToolRack machine={machine} />
      {groupedContents.length === 0 ? (
        <p className="italic text-ink-fade text-sm">Empty</p>
      ) : (
        <ul className="divide-y divide-ink-black/15 text-sm">
          {groupedContents.map(([materialName, materials]) => (
            <li key={materialName} className="flex items-center gap-2 py-1.5">
              <span className="grow">{materialName}</span>
              {materials.length > 1 && (
                <span className="font-mono text-ink-fade tabular-nums">
                  ×{materials.length}
                </span>
              )}
              <button
                className="button-paper text-xs"
                onClick={(event) => {
                  if (event.shiftKey) {
                    applyAction(takeInputsFromMachineAction(materials, machine));
                  } else {
                    applyAction(
                      takeInputsFromMachineAction([materials[0]], machine),
                    );
                  }
                }}
              >
                Take
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
