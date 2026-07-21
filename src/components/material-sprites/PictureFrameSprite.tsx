import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { FinishedProduct } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

/**
 * A picture frame: four mitered rails around an open middle, drawn at the
 * footprint its 2' rails actually make. Each rail is its own trapezoid, so
 * the corner seams — the whole point of the product — draw themselves.
 */
export const PictureFrameSprite: React.FC<
  {
    material: FinishedProduct;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ material, ...rest }) => {
  const { species } = material;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      // Four 2' rails, 1" wide: a 24" square frame with a 22" opening
      const outer = (24 * PIXELS_PER_INCH) / 2;
      const inner = outer - 1 * PIXELS_PER_INCH;

      const { primary, secondary } = colorBySpecies[species];

      // Trapezoids for the top/bottom and left/right rails, mirrored by
      // sign; the shared corners are the 45° seams.
      const horizontalRail = (sign: number): number[] => [
        -outer,
        outer * sign,
        outer,
        outer * sign,
        inner,
        inner * sign,
        -inner,
        inner * sign,
      ];
      const verticalRail = (sign: number): number[] => [
        outer * sign,
        -outer,
        outer * sign,
        outer,
        inner * sign,
        inner,
        inner * sign,
        -inner,
      ];

      // shadow: the same ring, a couple pixels proud — the opening stays
      // clear so the floor shows through
      const pad = 2;
      for (const [x, y, w, h] of [
        [-outer - pad, -outer - pad, (outer + pad) * 2, outer - inner + pad * 2],
        [-outer - pad, inner - pad, (outer + pad) * 2, outer - inner + pad * 2],
        [-outer - pad, -outer - pad, outer - inner + pad * 2, (outer + pad) * 2],
        [inner - pad, -outer - pad, outer - inner + pad * 2, (outer + pad) * 2],
      ]) {
        g.rect(x, y, w, h);
        g.fill({ color: 0x000000, alpha: 0.1 });
      }

      for (const sign of [-1, 1]) {
        g.poly(verticalRail(sign));
        g.fill(primary);
      }
      for (const sign of [-1, 1]) {
        g.poly(horizontalRail(sign));
        g.fill(primary);
        // top and bottom rails read slightly darker — the grain runs the
        // other way and catches the light
        g.poly(horizontalRail(sign));
        g.fill({ color: secondary, alpha: 0.2 });
      }

      // miter seams, outer corner to inner corner
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        g.moveTo(outer * sx, outer * sy);
        g.lineTo(inner * sx, inner * sy);
        g.stroke({ width: 1, color: secondary, alpha: 0.6 });
      }
    },
    [species],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
