import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

/**
 * A board stood on its end, seen from above: nothing but the end grain —
 * the bare width × thickness cross-section a table leg presents while it
 * waits under a face-down top. Drawn darker than the face (end grain
 * drinks light) with a few growth arcs seeded off the piece's id, so
 * standing a board up doesn't reroll its character.
 */
export const BoardOnEndSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
    /** Stable identity for procedural detail; pass the material id. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ board, seed, ...rest }) => {
  const { width: boardWidth, thickness, species } = board;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = boardWidth * PIXELS_PER_INCH;
      const h = (thickness / 4) * PIXELS_PER_INCH;
      const rand = seededRandom(seed ?? "on-end");
      const face = colorBySpecies[species].primary;
      const endGrain = colorToNumber(mixColors(face, 0x000000, 0.25));
      const ring = colorToNumber(mixColors(face, 0x000000, 0.45));

      // shadow: the standing piece throws a slightly wider foot
      for (const spread of [1, 2]) {
        g.rect(
          -w / 2 - spread,
          -h / 2 - spread,
          w + spread * 2,
          h + spread * 2,
        );
        g.fill({ color: 0x000000, alpha: 0.12 });
      }

      g.rect(-w / 2, -h / 2, w, h);
      g.fill(endGrain);

      // growth arcs sweeping in from one corner, like a real end cut
      const cx = -w / 2 + rand() * w;
      const cy = h / 2 + rand() * h * 0.5;
      for (let i = 1; i <= 3; i++) {
        const radius = (Math.max(w, h) * i) / 3 + rand() * 2;
        g.arc(cx, cy, radius, Math.PI, Math.PI * 2);
        g.stroke({ color: ring, width: 1, alpha: 0.5 });
      }

      // a hairline rim so the block reads as a cut face, not a fill
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ color: ring, width: 1, alpha: 0.7 });
    },
    [boardWidth, thickness, species, seed],
  );

  return <pixiGraphics draw={draw} {...omitUndefined(rest)} />;
};
