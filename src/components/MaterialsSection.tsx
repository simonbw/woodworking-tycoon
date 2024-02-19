import React, { useMemo } from "react";
import { MATERIALS } from "../game/GameState";
import { groupBy } from "../utils/arrayUtils";
import { useGameState } from "./useGameState";
import { useGameActions } from "./useGameActions";

export const MaterialsSection: React.FC = () => {
  const { gameState } = useGameState();
  const { giveMaterial } = useGameActions();

  const materialGroups = useMemo(
    () =>
      [...groupBy(gameState.materials, (material) => material).entries()].sort(
        (a, b) => a[0].name.localeCompare(b[0].name)
      ),
    [gameState.materials]
  );

  const storageSpace = useMemo(
    () =>
      gameState.materials.reduce(
        (acc, material) => acc + material.storageSize,
        0
      ),
    [gameState.materials]
  );

  return (
    <section className="space-y-2">
      <h2 className="section-heading">Materials ({storageSpace})</h2>
      <ul className="">
        {materialGroups.map(([material, items]) => (
          <li key={material.name}>
            {material.name} — {items.length}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          className="button"
          onClick={() => giveMaterial(MATERIALS.pallet)}
        >
          Find a Pallet
        </button>
      </div>
    </section>
  );
};
