import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  Board,
  defaultBoardFace,
  MaterialInstance,
} from "../../game/Materials";
import { edgeFill, woodArt } from "../material-sprites/woodFills";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

const WEATHERED_GRAY = 0x9a9186;

/**
 * A board seen edge-on for the block plane's edge work: the narrow strip
 * (thickness × length) the strokes are constrained to, windowed onto the
 * board's own wood. Unjointed it hides under the weathered veil; the
 * finished state shows the grain the plane brought up.
 */
export const EdgeBandSprite: React.FC<{
  material: MaterialInstance;
  finished: boolean;
}> = ({ material, finished }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (material.type !== "board") {
        return;
      }
      const board = material as Board;
      const width = (board.thickness / 4) * PIXELS_PER_INCH;
      const height = board.length * PIXELS_PER_INCH;
      const region =
        board.face ?? defaultBoardFace(board.id, board.length, board.width);
      const art = woodArt(board.species, region.seed, board.thickness);

      g.rect(-width / 2, -height / 2, width, height);
      g.fill(
        edgeFill(
          art,
          region,
          board.width,
          board.thickness,
          -width / 2,
          -height / 2,
        ),
      );
      if (!finished) {
        g.rect(-width / 2, -height / 2, width, height);
        g.fill({ color: WEATHERED_GRAY, alpha: 0.55 });
      }
    },
    [material, finished],
  );
  return <pixiGraphics draw={draw} />;
};
