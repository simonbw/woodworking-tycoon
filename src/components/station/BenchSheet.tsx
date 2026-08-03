import React from "react";
import { clampsFor, clampsFree } from "../../game/Clamp";
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
  shopSupply,
} from "../../game/machine-helpers";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { generateOperationPreview } from "../../game/operation-helpers";
import { BlueprintStack } from "./BlueprintStack";
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
import { RunHint } from "./RunHint";

/**
 * Recipe-driven stations (the benches): the plan picker, loaded bay, and
 * the tool/upgrade/shelf racks.
 */
export const BenchSheet: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<Operation>;
}> = ({ machine, operations }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { isTargeted } = useTargetedMachine();

  // Pry work isn't a plan: a staged pallet offers it by itself on the
  // bench top, so the picker neither lists it nor honors a stale
  // selection of it (old saves may still carry one).
  const plannableOperations = operations.filter(
    (op) => op.interaction?.kind !== "pry",
  );
  const rawSelection = machine.selectedOperationOrNull;
  const selectedOperation =
    rawSelection?.interaction?.kind === "pry" ? null : rawSelection;
  // A running job resolves against the plan and settings it finds when it
  // finishes, so both are held where they were until the work comes off.
  const working = machine.operationProgress.status === "inProgress";
  const freeClamps = clampsFree(gameState.clamps, gameState.machines);
  const canOperate = machineCanOperate(machine, shopSupply(gameState));
  const handSpace = handSpaceLeft(gameState.player);
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
        {/* A bench is honestly recipe-driven — and the recipes are a
            literal stack of shop drawings, thumbed through by hand */}
        <BlueprintStack
          operations={plannableOperations}
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
          locked={working}
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
              locked={working}
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

      {/* Clamps are borrowed for the run, not spent — the line reports the
          rack, and goes red when the other benches are holding too many */}
      {selectedOperation && clampsFor(selectedOperation) > 0 && (
        <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          Clamps:{" "}
          <span
            className={
              clampsFor(selectedOperation) <= freeClamps
                ? ""
                : "text-store-orange-dark"
            }
          >
            {clampsFor(selectedOperation)} (
            {freeClamps === gameState.clamps
              ? `have ${gameState.clamps}`
              : `${freeClamps} of ${gameState.clamps} free`}
            )
          </span>
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
            // An armful at a time: the button takes what fits in the
            // hands, and a bigger batch means coming back for the rest.
            <button
              className="button-paper text-xs"
              disabled={handSpace === 0}
              title={handSpace === 0 ? "Hands full" : undefined}
              onClick={() =>
                handSpace > 0 &&
                applyAction(
                  takeOutputsFromMachineAction(
                    machine.outputMaterials.slice(0, handSpace),
                    machine,
                  ),
                )
              }
            >
              {handSpace > 0 && machine.outputMaterials.length > handSpace
                ? `Take (${handSpace} of ${machine.outputMaterials.length})`
                : `Take All (${machine.outputMaterials.length})`}
            </button>
          ) : (
            <span className="text-ink-fade">
              Collect at outfeed ({machine.outputMaterials.length})
            </span>
          )}
        </div>
      )}

      {/* No run button: working a machine is a floor verb now — you stand
          at it and hold the operate key. The sheet is the paperwork
          (plans, settings, racks), not the controls. */}
      <RunHint machine={machine} canOperate={canOperate} />

      <ToolRack machine={machine} />
      <UpgradeRack machine={machine} />
      <MaterialShelf machine={machine} />
      <MachineManualLink machine={machine} />
    </>
  );
};
