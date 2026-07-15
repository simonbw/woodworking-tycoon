import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { FinishedProduct } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

/** A finished cutting board: rounded corners and a hanging hole. */
export const CuttingBoardSprite: React.FC<
  {
    material: FinishedProduct;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ material, ...rest }) => {
  const { species } = material;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const width = 10 * PIXELS_PER_INCH;
      const height = 16 * PIXELS_PER_INCH;
      const radius = 2 * PIXELS_PER_INCH;

      // shadow
      for (const shadowWidth of [1, 2]) {
        g.roundRect(
          -width / 2 - shadowWidth,
          -height / 2 - shadowWidth,
          width + shadowWidth * 2,
          height + shadowWidth * 2,
          radius + shadowWidth,
        );
        g.fill({ color: 0x000000, alpha: 0.1 });
      }

      // the board
      g.roundRect(-width / 2, -height / 2, width, height, radius);
      g.fill(colorBySpecies[species].primary);

      // hanging hole
      g.circle(0, -height / 2 + 2 * PIXELS_PER_INCH, 0.75 * PIXELS_PER_INCH);
      g.fill(colorBySpecies[species].secondary);
    },
    [species],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
