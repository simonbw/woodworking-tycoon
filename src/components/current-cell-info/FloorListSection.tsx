import React from "react";
import { MaterialPile } from "../../game/GameState";
import { getMaterialName } from "../../game/getMaterialName";
import { groupBy } from "../../utils/arrayUtils";
import { useActionKeys } from "../consumerCountContext";
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
    return null;
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
    <li
      className="cursor-pointer hover:bg-white/10 rounded-sm px-1"
      onClick={() => pickUpMaterial(piles[0])}
    >
      [{actionKey}] Pick Up {getMaterialName(piles[0].material)}
    </li>
  );
};
