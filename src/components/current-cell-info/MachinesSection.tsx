import React, { useState } from "react";
import { useCellMap } from "../../game/CellMap";
import { machineDustMultiplier } from "../../game/Dust";
import { MACHINE_ARTICLES } from "../../game/manual";
import { ManualLink } from "../manual/ManualLink";
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
  stowMaterialsInMachineAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
  takeStoredMaterialsFromMachineAction,
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
  mountToolAction,
  unmountToolAction,
} from "../../game/game-actions/tool-actions";
import {
  installUpgradeAction,
  uninstallUpgradeAction,
} from "../../game/game-actions/upgrade-actions";
import { UPGRADE_TYPES } from "../../game/Upgrade";
import {
  availableOperations,
  getOperationPhases,
} from "../../game/skill-helpers";
import { TOOL_TYPES } from "../../game/Tool";
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
import { groupBy } from "../../utils/arrayUtils";
import { classNames } from "../../utils/classNames";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialLabel } from "../MaterialLabel";
import { ProgressButton } from "../ProgressButton";
import { CutLineScale } from "./CutLineScale";
import { DetentScale } from "./DetentScale";
import { MaterialIcon } from "./MaterialIcon";
import { ModeControl } from "./ModeControl";

/**
 * Parameter ids follow the "targetLength" pattern; the matching bare
 * dimension on a piece of stock anchors the scale's "you are here" mark.
 */
function stockDimension(
  stock: MaterialInstance | undefined,
  paramId: string,
): number | undefined {
  if (!paramId.startsWith("target")) {
    return undefined;
  }
  const key = paramId.slice("target".length);
  const dimension = key.charAt(0).toLowerCase() + key.slice(1);
  const value = (stock as unknown as Record<string, unknown> | undefined)?.[
    dimension
  ];
  return typeof value === "number" ? value : undefined;
}

function loadedStockDimension(
  machine: Machine,
  paramId: string,
): number | undefined {
  return stockDimension(machine.inputMaterials[0], paramId);
}

export const MachinesSection: React.FC = () => {
  const gameState = useGameState();
  const { machines, isTargeted } = useTargetedMachine();

  // The player can't work machines while out of the shop, and can't work
  // this one with another machine over their shoulders — the spec sheet
  // (and its Operate button) would be a mouse-sized hole in the
  // hands-full rule the keyboard already enforces.
  if (
    gameState.player.away ||
    gameState.player.carriedMachine != null ||
    machines.length === 0
  ) {
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

  // Direct-feed machines (the planer) get the stripped-down card: their
  // whole interface is the machine's own physical controls.
  if (machine.type.directFeed) {
    return <DirectFeedMachineCard machine={machine} operations={operations} />;
  }

  // Null when nothing is selected yet (e.g. a freshly-placed station whose
  // only recipes came from tools)
  const selectedOperation = machine.selectedOperationOrNull;

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const canOperate = machineCanOperate(machine, gameState.consumables);
  const isOperating = machine.operationProgress.status === "inProgress";
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;
  // Durations shown include the dust slowdown, so the sheet stays honest
  // about what starting the operation right now would cost
  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );
  // Feed-through machines deliver finished stock to their outfeed cell;
  // it's collected there (see OutfeedSection), not from this spec sheet.
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
  // Phase detail only matters for ops that declared phases (glue-ups);
  // single-phase hand work keeps the plain "Running" status
  const currentPhase = isOperating
    ? phases[Math.min(phaseIndex, phases.length - 1)]
    : undefined;
  const waitingPhase =
    isOperating && ticksRemaining === 0 ? phases[phaseIndex + 1] : undefined;

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
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Spec Sheet
        </span>
      </header>

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

      <ToolRack machine={machine} />

      <UpgradeRack machine={machine} />

      <MaterialShelf machine={machine} />

      {/* Supplies drawn from the shop-wide stock when the op starts */}
      {selectedOperation?.requiredConsumables &&
        selectedOperation.requiredConsumables.length > 0 && (
          <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
            Supplies:{" "}
            {selectedOperation.requiredConsumables.map((cost, i) => {
              const type = CONSUMABLE_TYPES[cost.id];
              const stocked = gameState.consumables[cost.id] ?? 0;
              const enough = stocked >= cost.amount;
              // "8 nails", but "4 oz Mineral Oil" when the unit isn't the name
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

      <div className="flex items-center justify-between gap-2 text-xs font-condensed uppercase tracking-[0.15em] text-ink-fade">
        <span>
          Status:{" "}
          {isOperating ? (
            switchedOff ? (
              <span className="text-store-orange-dark">
                Paused · switched off
              </span>
            ) : waitingPhase ? (
              <span className="text-store-orange-dark">
                Ready · {waitingPhase.name} needs you
              </span>
            ) : selectedOperation?.phases && currentPhase ? (
              <span className="text-ink-blue">
                {currentPhase.name}
                {!currentPhase.attended && " (hands-free)"} · {ticksRemaining}{" "}
                ticks
              </span>
            ) : (
              <span className="text-ink-blue">
                Running · {ticksRemaining} ticks
              </span>
            )
          ) : switchedOff ? (
            "Switched off"
          ) : hasSwitch ? (
            <span className="text-ink-blue">Idling</span>
          ) : (
            "Idle"
          )}
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
            // Finished stock comes off the far side of a feed-through
            // machine — walk around to the outfeed cell to collect it.
            <span className="text-ink-fade">
              Collect at outfeed ({machine.outputMaterials.length})
            </span>
          ))}
      </div>

      <div className="flex items-stretch gap-2">
        {hasSwitch && (
          <Tooltip
            content={
              switchedOff ? "Flip the power on" : "Shut the machine down"
            }
            shortcut={isTargeted(machine) ? "power-toggle" : undefined}
          >
            <button
              className={classNames(
                "button-paper text-xs whitespace-nowrap shrink-0",
                !switchedOff && "text-ink-blue",
              )}
              onClick={() => applyAction(toggleMachinePowerAction(machine))}
            >
              {switchedOff ? "Switch On" : "Switch Off"}
            </button>
          </Tooltip>
        )}
        <Tooltip
          content={
            switchedOff ? "Switch the machine on first" : "Operate this machine"
          }
          shortcut={
            isTargeted(machine) && !switchedOff ? "operate-machine" : undefined
          }
        >
          <ProgressButton
            progress={progressPercent / 100}
            disabled={!canOperate || switchedOff}
            onClick={() => applyAction(operateMachineAction(machine))}
          >
            {isOperating ? "Operating..." : "Operate"}
          </ProgressButton>
        </Tooltip>
      </div>
    </section>
  );
};

/**
 * The stripped-down card for direct-feed machines: like standing at the
 * real thing, all you get is the machine's own physical controls — its
 * settings scales (fence, angle, height crank), the power switch if it
 * has one, and stock presented from your hands. No mode picker and no
 * input bay: which operation runs is decided by what you're carrying.
 * Everything secondary (tools, description) folds away, collapsed by
 * default.
 */
const DirectFeedMachineCard: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<MachineOperation | ParameterizedOperation>;
}> = ({ machine, operations }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();
  const [expanded, setExpanded] = useState(false);

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
  // Why the machine won't take what's in hand — the teaching moment. Power
  // problems trump stock problems, so a switched-off machine keeps its
  // "switch on first" line instead.
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
  const progressPercent =
    isOperating && totalDuration > 0
      ? ((totalDuration - machine.operationProgress.ticksRemaining) /
          totalDuration) *
        100
      : 0;

  // Single-point stations (miter saw) keep their cut pieces on the table;
  // feed-through machines deliver to the outfeed cell instead.
  const outputsCollectedHere = machine.type.outputPosition === undefined;
  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-2">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          {isOperating ? (
            switchedOff ? (
              <span className="text-store-orange-dark">
                Paused · switched off
              </span>
            ) : (
              <span className="text-ink-blue">
                Running · {machine.operationProgress.ticksRemaining} ticks
              </span>
            )
          ) : switchedOff ? (
            "Switched off"
          ) : hasSwitch ? (
            <span className="text-ink-blue">Idling</span>
          ) : (
            "Idle"
          )}
        </span>
      </header>

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

      <div className="flex items-stretch gap-2">
        {hasSwitch && (
          <Tooltip
            content={
              switchedOff ? "Flip the power on" : "Shut the machine down"
            }
            shortcut={isTargeted(machine) ? "power-toggle" : undefined}
          >
            <button
              className={classNames(
                "button-paper text-xs whitespace-nowrap shrink-0",
                !switchedOff && "text-ink-blue",
              )}
              onClick={() => applyAction(toggleMachinePowerAction(machine))}
            >
              {switchedOff ? "Switch On" : "Switch Off"}
            </button>
          </Tooltip>
        )}
        <Tooltip
          content={
            switchedOff
              ? "Switch the machine on first"
              : isOperating || canFeed
                ? `${verb} the carried stock`
                : (refusal ?? "Carry stock the machine is set up to take")
          }
          shortcut={
            isTargeted(machine) && !switchedOff ? "operate-machine" : undefined
          }
        >
          <ProgressButton
            progress={progressPercent / 100}
            disabled={!canFeed || switchedOff}
            onClick={() => applyAction(operateMachineAction(machine))}
          >
            {isOperating ? `${verb}ing...` : verb}
          </ProgressButton>
        </Tooltip>
      </div>

      {/* The machine explains itself: with stock in hand it won't take,
          the specific blocker shows as a penciled note under the button */}
      {refusal && carried.length > 0 && (
        <p className="text-[0.65rem] italic leading-snug text-ink-fade">
          {refusal}
        </p>
      )}

      {machine.outputMaterials.length > 0 &&
        (outputsCollectedHere ? (
          // Cut pieces sit on the saw table — take them right here
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {outputMaterials.map(([name, materials]) => (
                <span
                  key={name}
                  onClick={(event) => {
                    if (event.shiftKey) {
                      applyAction(
                        takeOutputsFromMachineAction(materials, machine),
                      );
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
        ) : (
          // Finished stock comes off the far side of a feed-through
          // machine — walk around to the outfeed cell to collect it.
          <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
            Collect at outfeed ({machine.outputMaterials.length})
          </div>
        ))}

      <div>
        <button
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-ink-fade hover:text-ink-black"
        >
          {expanded ? "▾ Details" : "▸ Details"}
        </button>
        {expanded && (
          <div className="space-y-3 pt-2">
            <p className="text-xs italic text-ink-fade">
              {machine.type.description}
            </p>
            <ToolRack machine={machine} />
            <MachineManualLink machine={machine} />
          </div>
        )}
      </div>
    </section>
  );
};

/** The spec sheet's pointer to the article that explains this machine. */
const MachineManualLink: React.FC<{ machine: Machine }> = ({ machine }) => {
  const article = MACHINE_ARTICLES[machine.state.machineTypeId];
  return article ? <ManualLink article={article} /> : null;
};

/**
 * Tool slots on a workstation: mounted tools can be removed to storage,
 * and stored tools can be mounted while slots are free. Mounting a tool
 * adds its operations to the station's Mode list.
 */
const ToolRack: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (machine.toolSlots === 0) {
    return null;
  }

  const freeSlots = machine.toolSlots - machine.state.tools.length;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          Tools · {machine.state.tools.length}/{machine.toolSlots} slots
        </div>
        <ManualLink article="tools" />
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
          gameState.storage.tools
            .filter((toolId) => {
              const compatible = TOOL_TYPES[toolId].compatibleMachines;
              return (
                !compatible || compatible.includes(machine.state.machineTypeId)
              );
            })
            .map((toolId, index) => (
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

/**
 * Upgrade slots on a worktable: installed upgrades can be removed to
 * storage, and stored upgrades installed while slots are free. Effects
 * (speed, tool slots, shelf spaces) fold into the station's stats
 * immediately.
 */
const UpgradeRack: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const slots = machine.type.upgradeSlots ?? 0;
  if (slots === 0) {
    return null;
  }

  const freeSlots = slots - machine.upgrades.length;

  return (
    <div className="space-y-1">
      <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        Upgrades · {machine.upgrades.length}/{slots} slots
      </div>
      <ul className="divide-y divide-ink-black/15 text-sm">
        {machine.upgrades.map((upgradeId, index) => (
          <li
            key={`${upgradeId}-${index}`}
            className="flex items-center gap-2 py-1"
          >
            <span className="grow">{UPGRADE_TYPES[upgradeId].name}</span>
            <button
              className="button-paper text-xs"
              onClick={() =>
                applyAction(uninstallUpgradeAction(machine, upgradeId))
              }
            >
              Remove
            </button>
          </li>
        ))}
        {freeSlots > 0 &&
          gameState.storage.upgrades.map((upgradeId, index) => (
            <li
              key={`stored-${upgradeId}-${index}`}
              className="flex items-center gap-2 py-1 text-ink-fade"
            >
              <span className="grow">
                {UPGRADE_TYPES[upgradeId].name} (stored)
              </span>
              <button
                className="button-paper text-xs"
                onClick={() =>
                  applyAction(installUpgradeAction(machine, upgradeId))
                }
              >
                Install
              </button>
            </li>
          ))}
        {machine.upgrades.length === 0 &&
          gameState.storage.upgrades.length === 0 && (
            <li className="py-1 italic text-ink-fade text-xs">
              No upgrades yet — build drawers and shelves at a bench, or buy
              a vise at the store.
            </li>
          )}
      </ul>
    </div>
  );
};

/**
 * The shelf under a station (MachineType.materialStorage spaces): parked
 * stock, out of the way of the floor and the input bay. Click a stored
 * material to take it back; Stow parks everything you're carrying that
 * fits.
 */
const MaterialShelf: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (machine.materialStorage === 0) {
    return null;
  }

  const stored = machine.storedMaterials;
  const freeSpaces = machine.materialStorage - stored.length;
  const stowable = gameState.player.inventory.slice(0, freeSpaces);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        <span>
          Shelf · {stored.length}/{machine.materialStorage}
        </span>
        {stowable.length > 0 && (
          <button
            className="button-paper text-xs normal-case tracking-normal"
            onClick={() =>
              applyAction(stowMaterialsInMachineAction(stowable, machine))
            }
          >
            Stow carried ({stowable.length})
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {stored.map((material, index) => (
          <span
            key={index}
            onClick={() =>
              applyAction(
                takeStoredMaterialsFromMachineAction([material], machine),
              )
            }
          >
            <MaterialIcon
              material={material}
              tooltip={`Take: ${getMaterialFullName(material)}`}
            />
          </span>
        ))}
        {stored.length === 0 && (
          <span className="italic text-ink-fade text-xs">
            Empty — stow carried stock here to keep the floor clear.
          </span>
        )}
      </div>
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
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-3">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Contents
        </span>
      </header>
      <ToolRack machine={machine} />
      <MaterialShelf machine={machine} />
      {groupedContents.length === 0 && machine.materialStorage === 0 ? (
        <p className="italic text-ink-fade text-sm">Empty</p>
      ) : (
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
                  if (event.shiftKey) {
                    applyAction(
                      takeInputsFromMachineAction(materials, machine),
                    );
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
