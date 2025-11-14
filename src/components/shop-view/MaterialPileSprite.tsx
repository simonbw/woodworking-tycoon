import React from "react";
import { MaterialPile } from "../../game/GameState";
import { PIXELS_PER_CELL } from "./shop-scale";
import { MaterialSprite } from "../material-sprites/MaterialSprite";

export const IMAGE_PIXELS_PER_INCH = 8;

export const MaterialPilesSprite: React.FC<{
  materialPiles: ReadonlyArray<MaterialPile>;
}> = ({ materialPiles }) => {
  return (
    <>
      {materialPiles.map((materialPile, i) => (
        <pixiContainer
          key={i}
          x={PIXELS_PER_CELL / 2}
          y={PIXELS_PER_CELL / 2}
          angle={i * 10}
        >
          <MaterialSprite material={materialPile.material} />
        </pixiContainer>
      ))}
    </>
  );
};
