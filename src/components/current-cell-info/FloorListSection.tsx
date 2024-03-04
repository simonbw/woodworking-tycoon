import React from "react";
import { useCellMap } from "../../game/CellMap";
import { MaterialPile } from "../../game/GameState";
import { pickUpMaterialAction } from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { useActionKeys } from "../consumerCountContext";
import { useApplyGameAction, useGameState } from "../useGameState";
import { useKeyDown } from "../useKeyDown";
import { MaterialIcon } from "./MaterialIcon";

export const FloorListSection: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);

  if (!playerCell?.materialPiles.length) {
    return (
      <div>
        <p className="italic text-gray-400">Floor is empty</p>
      </div>
    );
  }

  const groupedMaterials = [
    ...groupBy(playerCell.materialPiles, (pile) =>
      getMaterialName(pile.material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section>
      <ul className="space-y-1">
        {groupedMaterials.map(([materialName, piles]) => (
          <FloorListItem key={materialName} piles={piles} />
        ))}
      </ul>
    </section>
  );
};
const FloorListItem: React.FC<{ piles: MaterialPile[] }> = ({ piles }) => {
  const applyAction = useApplyGameAction();
  const actionKey = useActionKeys();

  useKeyDown((event) => {
    if (event.key === actionKey) {
      applyAction(pickUpMaterialAction(piles[0]));
    }
  });

  return (
    <li className="flex items-center gap-2">
      <MaterialIcon material={piles[0].material} />
      <span>{getMaterialName(piles[0].material)}</span>
      {piles.length > 1 && <em className="text-zinc-500">×{piles.length}</em>}
      <button
        className="button text-xs"
        onClick={() => applyAction(pickUpMaterialAction(piles[0]))}
      >
        Pick Up{actionKey && <span> [{actionKey}]</span>}
      </button>
    </li>
  );
};
