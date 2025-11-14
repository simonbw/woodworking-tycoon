import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { FinishedProduct } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";

export const FinishedBoxSprite: React.FC<{
  material: FinishedProduct;
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  return (
    <pixiGraphics
      {...omitUndefined({ alpha, tint })}
      draw={useCallback((g: Graphics) => {
        g.clear();
        g.rect(-10, -10, 20, 20);
        g.stroke({ width: 1, color: colorBySpecies[material.species].secondary });
        g.fill(colorBySpecies[material.species].primary);
      }, [])}
    />
  );
};
