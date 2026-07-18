import React from "react";
import { useCellMap } from "../../game/CellMap";
import { MaterialInstance } from "../../game/Materials";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
} from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { ShiftHint } from "../shortcuts/Kbd";
import { Tooltip } from "../Tooltip";
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
        <p className="italic text-ink-fade leading-[2rem]">
          Inventory is empty
        </p>
      </div>
    );
  }

  return (
    <div className="lined-sheet">
      <ul>
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
    <li className="flex items-center gap-2">
      <MaterialIcon material={materials[0]} size="small" />
      <span className="grow text-sm leading-[2rem]">
        {getMaterialName(materials[0])}
      </span>
      {materials.length > 1 && (
        // Handwritten tally — this sheet is maintained by hand
        <span className="font-ink text-lg leading-[2rem] text-ink-fade">
          ×{materials.length}
        </span>
      )}
      <Tooltip
        content={<ShiftHint verb="Drop" plural={materials.length > 1} />}
        shortcut="put-down"
      >
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
      </Tooltip>
      {operableMachines?.map((machine, index) => (
        <Tooltip
          key={index}
          content={
            <ShiftHint
              verb={`Load into ${machine.type.name}`}
              plural={materials.length > 1}
            />
          }
        >
          <button
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
        </Tooltip>
      ))}
    </li>
  );
};
