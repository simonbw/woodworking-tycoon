import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { FinishedProduct } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

/** Accent stripes for each board tier, as [offset, width] in inches. */
function accentStripes(type: FinishedProduct["type"]): [number, number][] {
  switch (type) {
    case "stripedCuttingBoard":
      // Strict alternation: accent at 2-4" and 6-8" of a 10" board
      return [
        [2, 2],
        [6, 2],
      ];
    case "sunriseCuttingBoard":
      // The fade: accent strips growing 1", 2", 3" across a 12" board
      return [
        [3, 1],
        [6, 2],
        [9, 3],
      ];
    default:
      // Two-tone: a free mix, so one wide stripe and one narrow
      return [
        [1.5, 3],
        [7, 1],
      ];
  }
}

/** A finished cutting board: rounded corners and a hanging hole. */
export const CuttingBoardSprite: React.FC<
  {
    material: FinishedProduct;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ material, ...rest }) => {
  const { type, species, accentSpecies } = material;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const widthInches = type === "sunriseCuttingBoard" ? 12 : 10;
      const width = widthInches * PIXELS_PER_INCH;
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

      // end grain reads as a brick grid of glued blocks
      if (type === "endGrainCuttingBoard") {
        const block = 2 * PIXELS_PER_INCH;
        const inset = 1.5;
        for (let row = 0; -height / 2 + row * block < height / 2; row++) {
          const y = -height / 2 + row * block;
          const offset = row % 2 === 0 ? 0 : block / 2;
          for (let x = -width / 2 - block + offset; x < width / 2; x += block) {
            g.rect(
              Math.max(x + inset, -width / 2 + inset),
              y + inset,
              Math.min(block - inset * 2, width / 2 - inset - x - inset),
              Math.min(block - inset * 2, height / 2 - y - inset * 2),
            );
            g.fill({ color: colorBySpecies[species].secondary, alpha: 0.35 });
          }
        }
      }

      // accent stripes over the base wood, patterned by tier
      if (accentSpecies) {
        for (const [offset, stripeWidth] of accentStripes(type)) {
          g.rect(
            -width / 2 + offset * PIXELS_PER_INCH,
            -height / 2 + 1,
            stripeWidth * PIXELS_PER_INCH,
            height - 2,
          );
          g.fill(colorBySpecies[accentSpecies].primary);
        }
      }

      // hanging hole
      g.circle(0, -height / 2 + 2 * PIXELS_PER_INCH, 0.75 * PIXELS_PER_INCH);
      g.fill(colorBySpecies[species].secondary);
    },
    [type, species, accentSpecies],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
