import { Assets, Graphics, Matrix, Texture } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { BOARD_END_SPAN_IN, BOARD_FACE_TEXTURES } from "./boardFaceTextures";

/**
 * A board stood on its end, seen from above: nothing but the end grain —
 * the bare width × thickness cross-section a table leg presents while it
 * waits under a face-down top. A window onto a real crosscut photograph
 * (boardFaceTextures.ts), placed by the piece's seed so standing a board
 * up doesn't reroll its character, and darkened a little because end
 * grain drinks light.
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
      const rand = seededRandom(`${seed ?? "on-end"}/end`);

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

      const ends = BOARD_FACE_TEXTURES[species].ends;
      const texture = Assets.get<Texture>(
        ends[Math.floor(rand() * ends.length)],
      );
      // The crop spans BOARD_END_SPAN_IN across; its height in inches
      // follows from the image's own aspect. The window slides within
      // whatever room the piece's cross-section leaves.
      const spanY =
        (BOARD_END_SPAN_IN * texture.source.height) / texture.source.width;
      const scale =
        (PIXELS_PER_INCH * BOARD_END_SPAN_IN) / texture.source.width;
      const offsetX = rand() * Math.max(0, BOARD_END_SPAN_IN - boardWidth);
      const offsetY = rand() * Math.max(0, spanY - thickness / 4);

      g.rect(-w / 2, -h / 2, w, h);
      g.fill({
        texture,
        matrix: new Matrix(
          scale,
          0,
          0,
          scale,
          -offsetX * PIXELS_PER_INCH - w / 2,
          -offsetY * PIXELS_PER_INCH - h / 2,
        ),
        textureSpace: "global",
      });

      // End grain sits in shade against the faces around it
      g.rect(-w / 2, -h / 2, w, h);
      g.fill({ color: 0x000000, alpha: 0.18 });

      // a hairline rim so the block reads as a cut face, not a fill
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ color: 0x000000, width: 1, alpha: 0.35 });
    },
    [boardWidth, thickness, species, seed],
  );

  return <pixiGraphics draw={draw} {...omitUndefined(rest)} />;
};
