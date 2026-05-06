import React from "react";
import { useCellMap } from "../../game/CellMap";
import { MaterialPile } from "../../game/GameState";
import { pickUpMaterialAction } from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialIcon } from "./MaterialIcon";

export const FloorListSection: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);

  if (!playerCell?.materialPiles.length) {
    return (
      <div className="lined-sheet text-center">
        <p className="italic text-ink-fade">Floor is empty</p>
      </div>
    );
  }

  const groupedMaterials = [
    ...groupBy(playerCell.materialPiles, (pile) =>
      getMaterialName(pile.material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="lined-sheet">
      <ul className="divide-y divide-ink-black/15">
        {groupedMaterials.map(([materialName, piles]) => (
          <FloorListItem key={materialName} piles={piles} />
        ))}
      </ul>
    </div>
  );
};

const FloorListItem: React.FC<{ piles: MaterialPile[] }> = ({ piles }) => {
  const applyAction = useApplyGameAction();

  return (
    <li className="flex items-center gap-2 py-1.5">
      <MaterialIcon material={piles[0].material} size="small" />
      <span className="grow text-sm">{getMaterialName(piles[0].material)}</span>
      {piles.length > 1 && (
        <span className="font-mono text-sm text-ink-fade tabular-nums">
          ×{piles.length}
        </span>
      )}
      <button
        className="button-paper text-xs"
        onClick={(event) => {
          if (event.shiftKey) {
            applyAction(pickUpMaterialAction(piles));
          } else {
            applyAction(pickUpMaterialAction([piles[0]]));
          }
        }}
      >
        Pick Up
      </button>
    </li>
  );
};
