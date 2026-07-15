import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Panel } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

/**
 * A glued-up panel: one rect per strip, colored by that strip's species, so
 * multi-species patterns render as actual stripes.
 */
export const PanelSprite: React.FC<
  {
    panel: Omit<Panel, "id" | "type">;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ panel, ...rest }) => {
  const { strips, length, thickness } = panel;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const totalWidth =
        strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
      const height = length * PIXELS_PER_INCH * INCHES_PER_FOOT;
      const depth = (thickness * PIXELS_PER_INCH) / 4;

      // shadow
      for (const shadowWidth of [1, 2]) {
        g.rect(
          -totalWidth / 2 - shadowWidth,
          -height / 2 - shadowWidth,
          totalWidth + depth + shadowWidth * 2,
          height + shadowWidth * 2,
        );
        g.fill({ color: 0x000000, alpha: 0.1 });
      }

      // strips, left to right in list order
      let x = -totalWidth / 2;
      for (const strip of strips) {
        const stripWidth = strip.width * PIXELS_PER_INCH;
        g.rect(x, -height / 2, stripWidth, height);
        g.fill(colorBySpecies[strip.species].primary);
        x += stripWidth;
      }

      // edge, colored by the last strip
      const lastSpecies = strips[strips.length - 1]?.species ?? "pine";
      g.rect(totalWidth / 2, -height / 2, depth, height);
      g.fill(colorBySpecies[lastSpecies].secondary);
    },
    [strips, length, thickness],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
