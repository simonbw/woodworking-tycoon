import React from "react";
import { MaterialInstance } from "../../game/Materials";
import { useActionKeys } from "../consumerCountContext";
import { useGameActions } from "../useGameActions";
import { useGameState } from "../useGameState";
import { useKeyDown } from "../useKeyDown";
import { getMaterialName } from "../../game/getMaterialName";
import { groupBy } from "../../utils/arrayUtils";
import { MaterialPileSprite } from "../shop-view/MaterialPileSprite";

export const InventorySection: React.FC = () => {
  const { gameState } = useGameState();

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
    <ul className="space-y-1sd">
      {groupedInventory.map(([materialName, materials]) => (
        <InventoryListItem key={materialName} materials={materials} />
      ))}
    </ul>
  );
};

const InventoryListItem: React.FC<{
  materials: MaterialInstance[];
}> = ({ materials }) => {
  const { dropMaterial } = useGameActions();
  const actionKey = useActionKeys();

  useKeyDown((event) => {
    if (event.key === actionKey) {
      dropMaterial(materials[0]);
    }
  });

  return (
    <li className="flex items-center gap-2">
      <svg viewBox="-50 -50 100 100" className="w-10 h-10 bg-white/10 rounded">
        <MaterialPileSprite material={materials[0]} />
      </svg>
      <span>{getMaterialName(materials[0])}</span>
      {materials.length > 1 && <em>x{materials.length}</em>}
      <button
        className="button text-xs"
        onClick={() => dropMaterial(materials[0])}
      >
        Drop{actionKey && <span> [{actionKey}]</span>}
      </button>
    </li>
  );
};
