import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { defaultBoardFace, EndGrainSlice } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { endFill, faceFill, TURNED_AWAY_SHADE, woodArt } from "./woodFills";

/**
 * One crosscut slice of a panel: a narrow stick showing the source strip
 * pattern in the real woods, waiting to be stood on end and glued into
 * an end-grain panel. The cut end it will be glued by caps one end.
 */
export const EndGrainSliceSprite: React.FC<
  {
    slice: EndGrainSlice;
    /** Stable identity for the strips' grain; pass the material id. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ slice, seed, ...rest }) => {
  const { strips, thickness } = slice;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const totalWidth =
        strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
      const heightIn = 2;
      const height = heightIn * PIXELS_PER_INCH;
      const sliceSeed = seed ?? `slice-${strips.length}`;

      // shadow
      g.rect(-totalWidth / 2 - 1, -height / 2 - 1, totalWidth + 2, height + 2);
      g.fill({ color: 0x000000, alpha: 0.1 });

      // pattern segments, left to right
      let x = -totalWidth / 2;
      let stripIndex = 0;
      let lastArt = undefined;
      for (const strip of strips) {
        const stripWidth = strip.width * PIXELS_PER_INCH;
        const stripSeed = `${sliceSeed}/strip-${stripIndex}`;
        const region = defaultBoardFace(stripSeed, heightIn, strip.width);
        const art = woodArt(strip.species, region.seed, thickness);
        lastArt = art;
        g.rect(x, -height / 2, stripWidth, height);
        g.fill(faceFill(art, region, x, -height / 2));
        x += stripWidth;
        stripIndex++;
      }

      // end-grain face: the glue face, capping one end
      if (lastArt !== undefined) {
        const capWidth = 2;
        g.rect(totalWidth / 2, -height / 2, capWidth, height);
        g.fill(
          endFill(
            lastArt,
            `${sliceSeed}/cap`,
            capWidth / PIXELS_PER_INCH,
            heightIn,
            totalWidth / 2,
            -height / 2,
          ),
        );
        g.rect(totalWidth / 2, -height / 2, capWidth, height);
        g.fill(TURNED_AWAY_SHADE);
      }
    },
    [strips, thickness, seed],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
