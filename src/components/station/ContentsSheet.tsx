import React from "react";
import { takeInputsFromMachineAction } from "../../game/game-actions/player-actions";
import { Machine } from "../../game/Machine";
import { getMaterialFullName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { MaterialLabel } from "../MaterialLabel";
import { useApplyGameAction } from "../useGameState";
import {
  MachineManualLink,
  MaterialShelf,
  ToolRack,
  UpgradeRack,
} from "./racks";

/** Stations with nothing to run (the sales table): their contents. */
export const ContentsSheet: React.FC<{ machine: Machine }> = ({ machine }) => {
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
