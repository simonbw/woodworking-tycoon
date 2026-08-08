import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { clipArcToRect } from "../../utils/arcClipping";
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
 *
 * The arcs are rings around a pith sitting off the face, the way a flatsawn
 * board's end reads, and they are clipped to the cut face — a ring only
 * exists where the saw exposed it.
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
      const cut = { x: -w / 2, y: -h / 2, width: w, height: h };

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

      // Growth rings around a pith below the face, spaced so each one actually
      // crosses the cut, then trimmed to the piece.
      const pithX = (rand() - 0.5) * w * 2;
      const pithY = h / 2 + w * (0.6 + rand() * 1.0);
      const ringCount = Math.max(2, Math.min(5, Math.round(w / 6)));
      for (let i = 0; i < ringCount; i++) {
        const t = (i + 0.5 + (rand() - 0.5) * 0.5) / ringCount;
        const crossingX = -w / 2 + t * w;
        const radius = Math.hypot(crossingX - pithX, pithY);
        const spans = clipArcToRect(
          pithX,
          pithY,
          radius,
          Math.PI,
          Math.PI * 2,
          cut,
        );
        for (const [from, to] of spans) {
          g.moveTo(
            pithX + radius * Math.cos(from),
            pithY + radius * Math.sin(from),
          );
          g.arc(pithX, pithY, radius, from, to);
          g.stroke({ color: ring, width: 1, alpha: 0.5 });
        }
      }

      // a hairline rim so the block reads as a cut face, not a fill
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ color: ring, width: 1, alpha: 0.7 });
    },
    [boardWidth, thickness, species, seed],
  );

  return <pixiGraphics draw={draw} {...omitUndefined(rest)} />;
};
