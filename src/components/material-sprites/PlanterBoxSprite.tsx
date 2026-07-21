import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { FinishedProduct } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";

/** Top-down planter: a slatted rim around a dark open interior. */
export const PlanterBoxSprite: React.FC<{
  material: FinishedProduct;
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  const colors = colorBySpecies[material.species];
  return (
    <pixiGraphics
      {...omitUndefined({ alpha, tint })}
      draw={useCallback(
        (g: Graphics) => {
          g.clear();
          g.rect(-12, -12, 24, 24);
          g.stroke({ width: 1, color: colors.secondary });
          g.fill(colors.primary);
          // The open interior, waiting for potting soil
          g.rect(-7, -7, 14, 14);
          g.fill(colors.secondary);
          // Slat seams across the rim
          for (const offset of [-4, 0, 4]) {
            g.moveTo(offset, -12).lineTo(offset, -7);
            g.moveTo(offset, 7).lineTo(offset, 12);
            g.moveTo(-12, offset).lineTo(-7, offset);
            g.moveTo(7, offset).lineTo(12, offset);
          }
          g.stroke({ width: 1, color: colors.secondary });
        },
        [colors],
      )}
    />
  );
};
