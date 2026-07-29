import React from "react";
import { MaterialPile } from "../../game/GameState";
import { PIXELS_PER_CELL } from "./shop-scale";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { TARGET_HIGHLIGHT_FILTERS } from "./targetHighlight";

export const IMAGE_PIXELS_PER_INCH = 8;

export const MaterialPilesSprite: React.FC<{
  materialPiles: ReadonlyArray<MaterialPile>;
  /**
   * The pile the interact key is about to pick up (compared by identity)
   * wears the shared targeting outline, so of a fanned stack it's always
   * clear which piece E grabs.
   */
  highlightedPile?: MaterialPile;
}> = ({ materialPiles, highlightedPile }) => {
  return (
    <>
      {materialPiles.map((materialPile, i) => (
        <pixiContainer
          key={i}
          x={PIXELS_PER_CELL / 2}
          y={PIXELS_PER_CELL / 2}
          angle={i * 10}
          filters={
            materialPile === highlightedPile
              ? TARGET_HIGHLIGHT_FILTERS
              : undefined
          }
        >
          <MaterialSprite material={materialPile.material} />
        </pixiContainer>
      ))}
    </>
  );
};
