import React from "react";
import {
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import { Machine } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSlot } from "../../game/machine-helpers";
import {
  createMockMaterial,
  describeMaterialRequirement,
  getMaterialFullName,
} from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { useApplyGameAction } from "../useGameState";

/**
 * The bench sheet's input→output bay: the loaded slots on the left
 * (placeholders for what's missing), the arrow, and what's ready — or
 * what would be produced — on the right. Outputs fall back through
 * real → exact-preview → mock-preview → placeholder.
 */
export const SlotDiagram: React.FC<{
  machine: Machine;
  inputSlots: ReadonlyArray<MaterialSlot>;
  expectedOutputs: ReadonlyArray<MaterialInstance>;
  previewOutputs: ReadonlyArray<MaterialInstance>;
}> = ({ machine, inputSlots, expectedOutputs, previewOutputs }) => {
  const applyAction = useApplyGameAction();
  const outputsCollectedHere = machine.type.outputPosition === undefined;

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
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

      <span className="text-ink-fade text-lg">→</span>

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
  );
};
