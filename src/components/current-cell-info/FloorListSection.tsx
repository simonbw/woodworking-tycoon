import React from "react";
import { MaterialPile } from "../../game/GameState";
import { getMaterialName } from "../../game/getMaterialName";
import { groupBy } from "../../utils/arrayUtils";
import { useActionKeys } from "../consumerCountContext";
import { MaterialPileSprite } from "../shop-view/MaterialPileSprite";
import { useGameActions } from "../useGameActions";
import { useGameHelpers } from "../useGameHelpers";
import { useGameState } from "../useGameState";
import { useKeyDown } from "../useKeyDown";

export const FloorListSection: React.FC = () => {
  const { gameState } = useGameState();
  const { getCellMap } = useGameHelpers();

  const cells = getCellMap();

  const [px, py] = gameState.player.position;
  const playerCell = cells[py][px];

  if (playerCell.materialPiles.length === 0) {
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
      <ul className="pl-1">
        {groupedMaterials.map(([materialName, piles]) => (
          <FloorListItem key={materialName} piles={piles} />
        ))}
      </ul>
    </section>
  );
};
const FloorListItem: React.FC<{ piles: MaterialPile[] }> = ({ piles }) => {
  const { pickUpMaterial } = useGameActions();
  const actionKey = useActionKeys();

  useKeyDown((event) => {
    if (event.key === actionKey) {
      pickUpMaterial(piles[0]);
    }
  });

  return (
    <li className="flex items-center gap-2">
      <svg viewBox="-50 -50 100 100" className="w-10 h-10">
        <MaterialPileSprite material={piles[0].material} />
      </svg>
      <span>{getMaterialName(piles[0].material)}</span>
      {piles.length > 1 && <em>x{piles.length}</em>}
      <button
        className="button text-xs"
        onClick={() => pickUpMaterial(piles[0])}
      >
        Pick Up{actionKey && <span> [{actionKey}]</span>}
      </button>
    </li>
  );
};
