import React, { useMemo } from "react";
import { groupBy } from "../utils/arrayUtils";
import { useGameState } from "./useGameState";
import { useGameActions } from "./useGameActions";
import { makeMaterial } from "../game/material-helpers";

export const MaterialsSection: React.FC = () => {
  const { gameState } = useGameState();
  const { addMaterial } = useGameActions();

  const materialGroups = useMemo(
    () =>
      [
        ...groupBy(
          gameState.materialPiles,
          (pile) => pile.material.type
        ).entries(),
      ].sort(([a], [b]) => a.localeCompare(b)),
    [gameState.materialPiles]
  );

  return (
    <section className="space-y-2">
      <h2 className="section-heading">Materials</h2>
      <div className="flex gap-2">
        <button
          className="button"
          onClick={() =>
            addMaterial(makeMaterial({ type: "pallet" }), [
              gameState.shopInfo.size[0] - 1,
              gameState.shopInfo.size[1] - 1,
            ])
          }
        >
          Find a Pallet
        </button>
      </div>
    </section>
  );
};
