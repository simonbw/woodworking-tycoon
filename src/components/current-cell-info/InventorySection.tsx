import React from "react";
import { useCellMap } from "../../game/CellMap";
import { MaterialInstance } from "../../game/Materials";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
} from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialIcon } from "./MaterialIcon";

export const InventorySection: React.FC = () => {
  const gameState = useGameState();

  const groupedInventory = [
    ...groupBy(gameState.player.inventory, (material) =>
      getMaterialName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  if (groupedInventory.length === 0) {
    return (
      <div className="lined-sheet text-center">
        <p className="italic text-ink-fade">Inventory is empty</p>
      </div>
    );
  }

  return (
    <div className="lined-sheet">
      <ul className="divide-y divide-ink-black/15">
        {groupedInventory.map(([materialName, materials]) => (
          <InventoryListItem key={materialName} materials={materials} />
        ))}
      </ul>
    </div>
  );
};

const InventoryListItem: React.FC<{
  materials: MaterialInstance[];
}> = ({ materials }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);
  // No loading machines while the player is out of the shop
  const operableMachines = gameState.player.away
    ? undefined
    : playerCell?.operableMachines;

  return (
    <li className="flex items-center gap-2 py-1.5">
      <MaterialIcon material={materials[0]} size="small" />
      <span className="grow text-sm">{getMaterialName(materials[0])}</span>
      {materials.length > 1 && (
        <span className="font-mono text-sm text-ink-fade tabular-nums">
          ×{materials.length}
        </span>
      )}
      <button
        className="button-paper text-xs"
        onClick={(event) => {
          if (event.shiftKey) {
            applyAction(dropMaterialAction(materials));
          } else {
            applyAction(dropMaterialAction([materials[0]]));
          }
        }}
      >
        Drop
      </button>
      {operableMachines?.map((machine, index) => (
        <button
          key={index}
          className="button-paper text-xs"
          onClick={(event) => {
            if (event.shiftKey) {
              applyAction(moveMaterialsToMachineAction(materials, machine));
            } else {
              applyAction(
                moveMaterialsToMachineAction([materials[0]], machine),
              );
            }
          }}
        >
          → {machine.type.name}
        </button>
      ))}
    </li>
  );
};
