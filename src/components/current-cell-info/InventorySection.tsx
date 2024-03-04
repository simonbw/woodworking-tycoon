import React from "react";
import { MaterialInstance } from "../../game/Materials";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
} from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { useActionKeys } from "../consumerCountContext";
import { useApplyGameAction, useGameState } from "../useGameState";
import { useKeyDown } from "../useKeyDown";
import { MaterialIcon } from "./MaterialIcon";
import { useCellMap } from "../../game/CellMap";

export const InventorySection: React.FC = () => {
  const gameState = useGameState();

  const groupedInventory = [
    ...groupBy(gameState.player.inventory, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  if (groupedInventory.length === 0) {
    return (
      <div>
        <p className="italic text-gray-400">Inventory is empty</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {groupedInventory.map(([materialName, materials]) => (
        <InventoryListItem key={materialName} materials={materials} />
      ))}
    </ul>
  );
};

const InventoryListItem: React.FC<{
  materials: MaterialInstance[];
}> = ({ materials }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);
  const operableMachines = playerCell?.operableMachines;

  return (
    <li className="flex items-center gap-2">
      <MaterialIcon material={materials[0]} />
      <span>{getMaterialName(materials[0])}</span>
      {materials.length > 1 && (
        <em className="text-zinc-500">×{materials.length}</em>
      )}
      <button
        className="button text-xs"
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
          className="button text-xs"
          onClick={(event) => {
            if (event.shiftKey) {
              applyAction(moveMaterialsToMachineAction(materials, machine));
            } else {
              applyAction(
                moveMaterialsToMachineAction([materials[0]], machine)
              );
            }
          }}
        >
          Move To {machine.type.name}
        </button>
      ))}
    </li>
  );
};
