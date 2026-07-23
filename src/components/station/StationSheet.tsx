import React from "react";
import { machineDustMultiplier } from "../../game/Dust";
import { Machine } from "../../game/Machine";
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
  parameterValueSatisfiable,
} from "../../game/machine-helpers";
import {
  createMockMaterial,
  describeMaterialRequirement,
  getMaterialFullName,
} from "../../game/material-helpers";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import {
  defaultParametersFor,
  executeOperation,
  generateOperationPreview,
  getOperationInputMaterials,
  isParameterizedOperation,
} from "../../game/operation-helpers";
import {
  availableOperations,
  getOperationPhases,
} from "../../game/skill-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialLabel } from "../MaterialLabel";
import { ProgressButton } from "../ProgressButton";
import { DetentScale } from "../current-cell-info/DetentScale";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { ModeControl } from "../current-cell-info/ModeControl";
import { MachineManualLink, MaterialShelf, ToolRack, UpgradeRack } from "./racks";
import { StatusText } from "./MachinePlacard";
import { loadedStockDimension } from "./station-helpers";

/**
 * The station sheet: a recipe-driven station's full paperwork, spread
 * out in the middle of the shop when the player steps up to it (Enter,
 * the placard's button, or clicking the station). Deliberately *not* a
 * modal — the world keeps ticking, the home-screen keys keep working on
 * the station, and walking away folds the sheet back up.
 */
export const StationSheet: React.FC = () => {
  const { sheetMachine, closeSheet } = useTargetedMachine();
  const gameState = useGameState();

  if (
    !sheetMachine ||
    gameState.player.away ||
    gameState.player.carriedMachine != null
  ) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ink-black/30 pointer-events-auto"
      onClick={closeSheet}
      data-testid="station-sheet"
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <StationSheetBody machine={sheetMachine} onClose={closeSheet} />
      </div>
    </div>
  );
};

const StationSheetBody: React.FC<{
  machine: Machine;
  onClose: () => void;
}> = ({ machine, onClose }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();

  const operations = availableOperations(machine, gameState.progression);
  const selectedOperation = machine.selectedOperationOrNull;

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const canOperate = machineCanOperate(machine, gameState.consumables);
  const isOperating = machine.operationProgress.status === "inProgress";
  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );
  const outputsCollectedHere = machine.type.outputPosition === undefined;
  const phases = selectedOperation
    ? getOperationPhases(
        selectedOperation,
        gameState.progression,
        dustMultiplier,
        machine.workSpeed,
      )
    : [];
  const { phaseIndex, ticksRemaining } = machine.operationProgress;
  const totalDuration = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const ticksLeftOverall = isOperating
    ? ticksRemaining +
      phases
        .slice(phaseIndex + 1)
        .reduce((sum, phase) => sum + phase.duration, 0)
    : 0;
  const progressPercent =
    isOperating && totalDuration > 0
      ? ((totalDuration - ticksLeftOverall) / totalDuration) * 100
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

  const groupedContents = [
    ...groupBy(machine.inputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-3 shadow-xl">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="flex items-center gap-3">
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
            Station Sheet
          </span>
          <Tooltip content="Put the sheet away" shortcut="close-sheet">
            <button
              className="button-paper text-xs leading-none"
              onClick={onClose}
              aria-label="Close station sheet"
            >
              ✕
            </button>
          </Tooltip>
        </span>
      </header>

      {operations.length > 0 ? (
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
              isParameterizedOperation(selectedOperation) &&
              selectedOperation.parameters.map((param, index) => (
                <div
                  key={param.id}
                  className="flex flex-row items-start gap-2 text-xs"
                >
                  <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16 shrink-0 inline-flex items-center gap-1.5 pt-2.5">
                    {param.name}
                    {/* Z drives the first parameter of the targeted machine */}
                    {index === 0 && isTargeted(machine) && (
                      <ShortcutKeys shortcut="cycle-parameter" />
                    )}
                  </span>
                  <DetentScale
                    param={param}
                    value={
                      machine.selectedParameters?.[param.id] ?? param.values[0]
                    }
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
                </div>
              ))}
          </div>

          {/* Supplies drawn from the shop-wide stock when the op starts */}
          {selectedOperation?.requiredConsumables &&
            selectedOperation.requiredConsumables.length > 0 && (
              <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
                Supplies:{" "}
                {selectedOperation.requiredConsumables.map((cost, i) => {
                  const type = CONSUMABLE_TYPES[cost.id];
                  const stocked = gameState.consumables[cost.id] ?? 0;
                  const enough = stocked >= cost.amount;
                  // "8 nails", but "4 oz Mineral Oil" when the unit isn't
                  // the name
                  const label =
                    type.unit === type.name.toLowerCase()
                      ? `${cost.amount} ${type.unit}`
                      : `${cost.amount} ${type.unit} ${type.name}`;
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
                        ? `Needs: ${describeMaterialRequirement(slot.requirement)}`
                        : getMaterialFullName(slot.material)
                    }
                  />
                </span>
              ))}
              {inputSlots.length === 0 && (
                <MaterialIcon
                  material={createMockMaterial({
                    type: ["board"],
                    quantity: 1,
                  })}
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
                    if (!outputsCollectedHere) {
                      return;
                    }
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
                    tooltip={
                      outputsCollectedHere
                        ? `Ready: ${name}`
                        : `${name} — waiting at the outfeed side`
                    }
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
                    tooltip={`Will produce: ${getMaterialFullName(output)}`}
                  />
                ))}

              {outputMaterials.length === 0 &&
                expectedOutputs.length === 0 &&
                previewOutputs.map((output, i) => (
                  <MaterialIcon
                    key={`preview-${i}`}
                    material={output}
                    placeholder={true}
                    tooltip={`Will produce: ${getMaterialFullName(output)}`}
                  />
                ))}

              {outputMaterials.length === 0 &&
                expectedOutputs.length === 0 &&
                previewOutputs.length === 0 && (
                  <MaterialIcon
                    material={createMockMaterial({
                      type: ["board"],
                      quantity: 1,
                    })}
                    placeholder={true}
                    tooltip="Output will appear here"
                  />
                )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs font-condensed uppercase tracking-[0.15em] text-ink-fade">
            <span>
              Status: <StatusText machine={machine} />
            </span>
            {machine.outputMaterials.length > 0 &&
              (outputsCollectedHere ? (
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
              ))}
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
        </>
      ) : (
        // Stations with nothing to run (the sales table): their contents,
        // taken back per item.
        <ul className="divide-y divide-ink-black/15 text-sm">
          {groupedContents.map(([materialName, materials]) => (
            <li key={materialName} className="flex items-center gap-2 py-1.5">
              <MaterialLabel material={materials[0]} />
              {materials.length > 1 && (
                <span className="font-mono text-ink-fade tabular-nums">
                  ×{materials.length}
                </span>
              )}
              <button
                className="button-paper text-xs"
                onClick={(event) => {
                  applyAction(
                    takeInputsFromMachineAction(
                      event.shiftKey ? materials : [materials[0]],
                      machine,
                    ),
                  );
                }}
              >
                Take
              </button>
            </li>
          ))}
          {groupedContents.length === 0 && (
            <li className="py-1 italic text-ink-fade text-sm">Empty</li>
          )}
        </ul>
      )}

      <ToolRack machine={machine} />
      <UpgradeRack machine={machine} />
      <MaterialShelf machine={machine} />
      <MachineManualLink machine={machine} />
    </section>
  );
};
