import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { EndGrainSlice } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

/**
 * One crosscut slice of a panel: a narrow stick showing the source strip
 * pattern, waiting to be stood on end and glued into an end-grain panel.
 */
export const EndGrainSliceSprite: React.FC<
  {
    slice: EndGrainSlice;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ slice, ...rest }) => {
  const { strips } = slice;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const totalWidth =
        strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
      const height = 2 * PIXELS_PER_INCH;

      // shadow
      g.rect(-totalWidth / 2 - 1, -height / 2 - 1, totalWidth + 2, height + 2);
      g.fill({ color: 0x000000, alpha: 0.1 });

      // pattern segments, left to right
      let x = -totalWidth / 2;
      for (const strip of strips) {
        const stripWidth = strip.width * PIXELS_PER_INCH;
        g.rect(x, -height / 2, stripWidth, height);
        g.fill(colorBySpecies[strip.species].primary);
        x += stripWidth;
      }

      // end-grain face: darker cap on one end
      g.rect(totalWidth / 2, -height / 2, 2, height);
      g.fill(colorBySpecies[strips[strips.length - 1].species].secondary);
    },
    [strips],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
