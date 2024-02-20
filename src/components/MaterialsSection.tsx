import React, { useMemo } from "react";
import { groupBy } from "../utils/arrayUtils";
import { useGameState } from "./useGameState";
import { useGameActions } from "./useGameActions";

export const MaterialsSection: React.FC = () => {
  const { gameState } = useGameState();
  const { giveMaterial } = useGameActions();

  const materialGroups = useMemo(
    () =>
      [
        ...groupBy(gameState.materials, (material) => material.type).entries(),
      ].sort(([a], [b]) => a.localeCompare(b)),
    [gameState.materials]
  );

  return (
    <section className="space-y-2">
      <h2 className="section-heading">Materials</h2>
      <ul className="">
        {materialGroups.map(([material, items]) => (
          <li key={material}>
            {material} — {items.length}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          className="button"
          onClick={() => giveMaterial({ type: "pallet" })}
        >
          Find a Pallet
        </button>
      </div>
    </section>
  );
};
