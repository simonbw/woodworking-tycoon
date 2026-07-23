import React, { useState } from "react";
import { machineDustMultiplier } from "../../game/Dust";
import {
  Machine,
  MachineOperation,
  OperationParameter,
  ParameterizedOperation,
} from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import {
  canPickUpMachine,
} from "../../game/game-actions/machine-actions";
import {
  operateMachineAction,
  setMachineSettingsAction,
  setMachineOperationAction,
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
  describeMaterialRequirement,
  getMaterialFullName,
} from "../../game/material-helpers";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import {
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
import { ProgressButton } from "../ProgressButton";
import { CutLineScale } from "../current-cell-info/CutLineScale";
import { DetentScale } from "../current-cell-info/DetentScale";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { MachineManualLink, ToolRack } from "./racks";
import { stockDimension } from "./station-helpers";

/**
 * The placard pinned to the machine the player is standing at: the
 * machine's own physical controls and nothing else, anchored to the
 * machine itself in the shop view. Direct-feed machines get their full
 * interface here (it *is* the machine's interface); recipe-driven
 * stations get their status, plan, and verbs, with the full sheet a
 * keypress away.
 */
export const MachinePlacard: React.FC<{ machine: Machine }> = ({ machine }) => {
  const gameState = useGameState();

  const operations = availableOperations(machine, gameState.progression);
  if (operations.length === 0) {
    return <ContentsPlacard machine={machine} />;
  }
  if (machine.type.directFeed) {
    return <DirectFeedPlacard machine={machine} operations={operations} />;
  }
  return <BenchPlacard machine={machine} operations={operations} />;
};

/** The status wording shared by every placard header (and the sheet). */
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

const PlacardHeader: React.FC<{ machine: Machine }> = ({ machine }) => (
  <header className="flex items-baseline justify-between gap-3 border-b-2 border-ink-black/40 pb-1">
    <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
      {machine.type.name}
    </h3>
    <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade text-right">
      <StatusText machine={machine} />
    </span>
  </header>
);

/**
 * The quiet footer of key hints for verbs that have no button on the
 * placard: cycling targets on a crowded square and hoisting the machine.
 */
const PlacardHints: React.FC<{ machine: Machine }> = ({ machine }) => {
  const gameState = useGameState();
  const { machines } = useTargetedMachine();

  const liftable =
    gameState.progression.shopLayoutUnlocked &&
    gameState.player.carriedMachine == null &&
    canPickUpMachine(gameState, machine.state);

  const hints: React.ReactNode[] = [];
  if (machines.length > 1) {
    hints.push(
      <span key="cycle" className="inline-flex items-center gap-1">
        <ShortcutKeys shortcut="cycle-machine" /> next machine (
        {machines.length} here)
      </span>,
    );
  }
  if (liftable) {
    hints.push(
      <span key="carry" className="inline-flex items-center gap-1">
        <ShortcutKeys shortcut="carry-machine" /> pick up{" "}
        {machine.type.name}
      </span>,
    );
  }
  if (hints.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-ink-fade">
      {hints}
    </div>
  );
};

/** The power switch + main verb button row shared by the placards. */
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

/** Cut pieces waiting on a single-point station, taken right here. */
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
 * Direct-feed machines: the whole interface is here, like standing at
 * the real thing — settings scales, the switch, and stock presented
 * from your hands. Which operation runs is decided by what you carry.
 */
const DirectFeedPlacard: React.FC<{
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
  const progress =
    isOperating && totalDuration > 0
      ? (totalDuration - machine.operationProgress.ticksRemaining) /
        totalDuration
      : 0;

  return (
    <section className="paper-card space-y-2">
      <PlacardHeader machine={machine} />

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

      <PlacardHints machine={machine} />
    </section>
  );
};

/**
 * Recipe-driven stations (benches, the garbage can): the placard shows
 * the pinned plan, what's loaded against it, and the verbs; picking
 * plans and managing tools/shelf happens on the full station sheet.
 */
const BenchPlacard: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<MachineOperation | ParameterizedOperation>;
}> = ({ machine, operations }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted, openSheet } = useTargetedMachine();

  const selectedOperation = machine.selectedOperationOrNull;
  const planLabel =
    machine.type.worktable || machine.state.machineTypeId === "workspace"
      ? "Plan"
      : "Mode";

  const isOperating = machine.operationProgress.status === "inProgress";
  const canOperate = machineCanOperate(machine, gameState.consumables);
  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );
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

  const missingSupplies = (selectedOperation?.requiredConsumables ?? []).filter(
    (cost) => (gameState.consumables[cost.id] ?? 0) < cost.amount,
  );

  return (
    <section className="paper-card space-y-2">
      <PlacardHeader machine={machine} />

      {/* The pinned plan — picked on the station sheet, cycled with Q */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade inline-flex items-center gap-1.5">
          {planLabel}
          {isTargeted(machine) && <ShortcutKeys shortcut="cycle-operation" />}
        </span>
        <span className="grow truncate">
          {selectedOperation ? selectedOperation.name : "— nothing pinned —"}
        </span>
      </div>

      {selectedOperation &&
        isParameterizedOperation(selectedOperation) &&
        selectedOperation.parameters.map((param, index) => (
          <div
            key={param.id}
            className="flex flex-row items-start gap-2 text-xs"
          >
            <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16 shrink-0 inline-flex items-center gap-1.5 pt-2.5">
              {param.name}
              {index === 0 && isTargeted(machine) && (
                <ShortcutKeys shortcut="cycle-parameter" />
              )}
            </span>
            <DetentScale
              param={param}
              value={machine.selectedParameters?.[param.id] ?? param.values[0]}
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
              stockValue={stockDimension(machine.inputMaterials[0], param.id)}
            />
          </div>
        ))}

      {/* What's loaded against the plan — F loads from the hands */}
      {inputSlots.length > 0 && (
        <div className="flex items-center gap-1">
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
        </div>
      )}

      {missingSupplies.length > 0 && (
        <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-store-orange-dark">
          Short on supplies:{" "}
          {missingSupplies
            .map(
              (cost) =>
                `${cost.amount} ${CONSUMABLE_TYPES[cost.id].unit} (have ${
                  gameState.consumables[cost.id] ?? 0
                })`,
            )
            .join(" · ")}
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

      <OutputsRow machine={machine} />

      <div className="flex items-center justify-between">
        <Tooltip
          content="Spread out the station sheet — plans, tools, shelf"
          shortcut={isTargeted(machine) ? "open-station-sheet" : undefined}
        >
          <button
            className="button-paper text-xs"
            onClick={() => openSheet(machine)}
          >
            Plans &amp; Tools
          </button>
        </Tooltip>
        <PlacardHints machine={machine} />
      </div>
    </section>
  );
};

/**
 * Stations with nothing to run (the sales table): a glance at what's on
 * it; the full contents list lives on the station sheet.
 */
const ContentsPlacard: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const { isTargeted, openSheet } = useTargetedMachine();

  const contents: ReadonlyArray<MaterialInstance> = machine.inputMaterials;
  const groupedContents = [
    ...groupBy(contents, (material) => getMaterialFullName(material)).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-2">
      <PlacardHeader machine={machine} />
      {groupedContents.length === 0 &&
      machine.storedMaterials.length === 0 ? (
        <p className="italic text-ink-fade text-sm">Empty</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {groupedContents.map(([name, materials]) => (
            <span
              key={name}
              onClick={(event) => {
                applyAction(
                  takeInputsFromMachineAction(
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
          {machine.storedMaterials.length > 0 && (
            <span className="self-center font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-ink-fade">
              + {machine.storedMaterials.length} shelved
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Tooltip
          content="Spread out the station sheet"
          shortcut={isTargeted(machine) ? "open-station-sheet" : undefined}
        >
          <button
            className="button-paper text-xs"
            onClick={() => openSheet(machine)}
          >
            Open
          </button>
        </Tooltip>
        <PlacardHints machine={machine} />
      </div>
    </section>
  );
};

/**
 * Finished stock waiting at the outfeed side of a feed-through machine,
 * anchored to the machine while the player stands at its outfeed cell.
 */
export const OutfeedPlacard: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();

  const groupedOutputs = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-2">
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Outfeed
        </span>
      </header>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {groupedOutputs.map(([name, materials]) => (
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
        <Tooltip content="Take one — hold Shift for all" shortcut="pick-up">
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
        </Tooltip>
      </div>
    </section>
  );
};
