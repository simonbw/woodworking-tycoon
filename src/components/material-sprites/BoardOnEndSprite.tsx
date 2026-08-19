import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { endFill, TURNED_AWAY_SHADE, woodArt } from "./woodFills";

/**
 * A board stood on its end, seen from above: nothing but the end grain —
 * the bare width × thickness cross-section a table leg presents while it
 * waits under a face-down top. A window onto a real crosscut photograph,
 * placed by the piece's seed so standing a board up doesn't reroll its
 * character, and shaded twice over because end grain drinks light.
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
      const pieceSeed = seed ?? "on-end";

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

      const art = woodArt(species, pieceSeed, thickness);
      g.rect(-w / 2, -h / 2, w, h);
      g.fill(
        endFill(art, pieceSeed, boardWidth, thickness / 4, -w / 2, -h / 2),
      );

      // End grain sits in shade against the faces around it
      for (const _ of [0, 1]) {
        g.rect(-w / 2, -h / 2, w, h);
        g.fill(TURNED_AWAY_SHADE);
      }

      // a hairline rim so the block reads as a cut face, not a fill
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ color: 0x000000, width: 1, alpha: 0.35 });
    },
    [boardWidth, thickness, species, seed],
  );

  return <pixiGraphics draw={draw} {...omitUndefined(rest)} />;
};
