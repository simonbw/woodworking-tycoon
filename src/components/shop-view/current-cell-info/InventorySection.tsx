import React from "react";
import { MaterialInstance } from "../../../game/Materials";
import { useActionKeys } from "../../consumerCountContext";
import { useGameActions } from "../../useGameActions";
import { useGameState } from "../../useGameState";
import { useKeyDown } from "../../useKeyDown";
import { getMaterialName } from "../../../game/getMaterialName";
import { groupBy } from "../../../utils/arrayUtils";

export const InventorySection: React.FC = () => {
  const { gameState } = useGameState();

  const groupedInventory = [
    ...groupBy(gameState.player.inventory, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  if (groupedInventory.length === 0) {
    return null;
  }

  return (
    <section>
      <ul className="pl-1">
        {groupedInventory.map(([materialName, materials]) => (
          <InventoryListItem key={materialName} materials={materials} />
        ))}
      </ul>
    </section>
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
    <li
      className="cursor-pointer hover:bg-white/10 rounded-sm px-1"
      onClick={() => dropMaterial(materials[0])}
    >
      [{actionKey}] Drop {getMaterialName(materials[0])}{" "}
      {materials.length > 1 && <em>x{materials.length}</em>}
    </li>
  );
};
