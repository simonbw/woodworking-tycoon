import React from "react";
import { machineDustMultiplier } from "../../game/Dust";
import {
  Machine,
  MachineOperation,
  OperationParameter,
  ParameterizedOperation,
} from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import {
  operateMachineAction,
  setMachineOperationAction,
  setMachineSettingsAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
  toggleMachinePowerAction,
} from "../../game/game-actions/player-actions";
import {
  explainFeedRefusal,
  machineCanOperate,
  matchMaterialsToSlots,
  parameterValueSatisfiable,
  slideStock,
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
import { CutLineScale } from "../current-cell-info/CutLineScale";
import { DetentScale } from "../current-cell-info/DetentScale";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { ModeControl } from "../current-cell-info/ModeControl";
import {
  MachineManualLink,
  MaterialShelf,
  ToolRack,
  UpgradeRack,
} from "./racks";
import { loadedStockDimension, stockDimension } from "./station-helpers";

/** The status wording shared by the sheet header and the hint chips. */
export const StatusText: React.FC<{ machine: Machine }> = ({ machine }) => {
  const gameState = useGameState();
  const isOperating = machine.operationProgress.status === "inProgress";
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;

  const operation = machine.selectedOperationOrNull;
  const phases = operation
    ? getOperationPhases(
        operation,
        gameState.progression,
        machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
        machine.workSpeed,
      )
    : [];
  const { phaseIndex, ticksRemaining } = machine.operationProgress;
  const currentPhase = isOperating
    ? phases[Math.min(phaseIndex, phases.length - 1)]
    : undefined;
  const waitingPhase =
    isOperating && ticksRemaining === 0 ? phases[phaseIndex + 1] : undefined;

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

/** The power switch + main verb button row. */
const VerbRow: React.FC<{
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
const OutputsRow: React.FC<{ machine: Machine }> = ({ machine }) => {
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

/**
 * The station sheet: a machine's full paperwork, spread out in the
 * middle of the shop when the player steps up to it (Enter, or clicking
 * the station). The on-machine hint chips cover the quick verbs;
 * everything with buttons and scales lives here. Deliberately *not* a
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

const SheetFrame: React.FC<{
  machine: Machine;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ machine, onClose, children }) => (
  <section className="paper-card space-y-3 shadow-xl">
    <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
      <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
        {machine.type.name}
      </h3>
      <span className="flex items-center gap-3">
        <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          <StatusText machine={machine} />
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
    {children}
  </section>
);

const StationSheetBody: React.FC<{
  machine: Machine;
  onClose: () => void;
}> = ({ machine, onClose }) => {
  const gameState = useGameState();
  const operations = availableOperations(machine, gameState.progression);

  return (
    <SheetFrame machine={machine} onClose={onClose}>
      {operations.length === 0 ? (
        <ContentsSheetBody machine={machine} />
      ) : machine.type.directFeed ? (
        <DirectFeedSheetBody machine={machine} operations={operations} />
      ) : (
        <BenchSheetBody machine={machine} operations={operations} />
      )}
    </SheetFrame>
  );
};

/**
 * Direct-feed machines: the machine's own physical controls — settings
 * scales, the switch, and stock presented from your hands. Which
 * operation runs is decided by what you carry.
 */
const DirectFeedSheetBody: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<MachineOperation | ParameterizedOperation>;
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
    operation: ParameterizedOperation;
  }> = [];
  for (const op of operations) {
    if (!isParameterizedOperation(op)) continue;
    for (const param of op.parameters) {
      if (!settings.some((s) => s.param.id === param.id)) {
        settings.push({ param, operation: op });
      }
    }
  }

  const isOperating = machine.operationProgress.status === "inProgress";
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

  // Progress reads off the running operation (recorded when it was fed)
  const runningOperation = machine.selectedOperationOrNull;
  const phases = runningOperation
    ? getOperationPhases(
        runningOperation,
        gameState.progression,
        machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
        machine.workSpeed,
      )
    : [];
  const totalDuration = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const progress =
    isOperating && totalDuration > 0
      ? (totalDuration - machine.operationProgress.ticksRemaining) /
        totalDuration
      : 0;

  return (
    <>
      {settings.map(({ param, operation }, index) => (
        <div key={param.id} className="flex flex-row items-start gap-2 text-xs">
          <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16 shrink-0 inline-flex items-center gap-1.5 pt-2.5">
            {param.name}
            {/* Z drives the first setting of the targeted machine */}
            {index === 0 && isTargeted(machine) && (
              <ShortcutKeys shortcut="cycle-parameter" />
            )}
          </span>
          {param.presentation === "slide" ? (
            // The carried board itself under the blade line — sliding it
            // is the input, and the head's set lean shows on the line
            <CutLineScale
              param={param}
              value={
                machine.selectedParameters?.[param.id] ??
                param.defaultValue ??
                param.values[0]
              }
              onSelect={(value) =>
                applyAction(
                  setMachineSettingsAction(machine, { [param.id]: value }),
                )
              }
              satisfiable={(value) =>
                parameterValueSatisfiable(
                  machine,
                  operation,
                  param.id,
                  value,
                  carried,
                )
              }
              board={slideStock(machine, operations, carried)}
              angle={Number(machine.selectedParameters?.angle ?? 0)}
            />
          ) : (
            <DetentScale
              param={param}
              value={
                machine.selectedParameters?.[param.id] ??
                param.defaultValue ??
                param.values[0]
              }
              onSelect={(value) =>
                applyAction(
                  setMachineSettingsAction(machine, { [param.id]: value }),
                )
              }
              satisfiable={(value) =>
                parameterValueSatisfiable(
                  machine,
                  operation,
                  param.id,
                  value,
                  carried,
                )
              }
              stockValue={carried
                .map((material) => stockDimension(material, param.id))
                .find((value) => value !== undefined)}
            />
          )}
        </div>
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

/**
 * Recipe-driven stations (benches, the garbage can): the plan picker,
 * loaded bay, and the tool/upgrade/shelf racks.
 */
const BenchSheetBody: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<MachineOperation | ParameterizedOperation>;
}> = ({ machine, operations }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();

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
  const progress =
    isOperating && totalDuration > 0
      ? (totalDuration - ticksLeftOverall) / totalDuration
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
                material={createMockMaterial({ type: ["board"], quantity: 1 })}
                placeholder={true}
                tooltip="Output will appear here"
              />
            )}
        </div>
      </div>

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

/** Stations with nothing to run (the sales table): their contents. */
const ContentsSheetBody: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();

  const groupedContents = [
    ...groupBy(machine.inputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
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
      <ToolRack machine={machine} />
      <UpgradeRack machine={machine} />
      <MaterialShelf machine={machine} />
      <MachineManualLink machine={machine} />
    </>
  );
};
