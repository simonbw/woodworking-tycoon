import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board, defaultBoardFace } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { edgeFill, faceFill, TURNED_AWAY_SHADE, woodArt } from "./woodFills";

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

/**
 * A board stood on its long edge, seen from above: the narrow edge face
 * (thickness × length) up, with a sliver of the board's wide face
 * showing down one side the way a standing rail leans its face into
 * view. Both surfaces are windows onto the board's own scans, placed by
 * its face region, so tipping a board up shows the same wood it showed
 * lying down. Same milled-state language as BoardSprite: unjointed
 * edges weather gray, jointing lifts the veil.
 */
export const BoardOnEdgeSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
    /** Stable identity for procedural detail; pass the material id. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ board, seed, ...rest }) => {
  const {
    width: boardWidth,
    length: boardLength,
    thickness,
    species,
    surface,
    jointedFaces,
    jointedEdges,
    face,
  } = board;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const width = (thickness / 4) * PIXELS_PER_INCH;
      const height = boardLength * PIXELS_PER_INCH;
      // The face leans a hair into view beside the edge — enough to read
      // "standing board", never wider than the edge itself.
      const lean = Math.min(width * 0.8, 3);
      const pieceSeed =
        seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`;
      const region =
        face ?? defaultBoardFace(pieceSeed, boardLength, boardWidth);
      const art = woodArt(species, region.seed, thickness);

      // A standing board throws a longer shadow than a lying one
      for (const shadowWidth of [1.5, 3]) {
        g.rect(
          -width / 2 - shadowWidth,
          -height / 2 - shadowWidth,
          width + lean + shadowWidth * 2,
          height + shadowWidth * 2,
        );
        g.fill({ color: 0x000000, alpha: 0.12 });
      }

      // The upturned edge face
      g.rect(-width / 2, -height / 2, width, height);
      g.fill(
        edgeFill(art, region, boardWidth, thickness, -width / 2, -height / 2),
      );

      // The sliver of wide face leaning into view beside it, shaded
      // because it tips away from the light
      g.rect(width / 2, -height / 2, lean, height);
      g.fill(faceFill(art, region, width / 2, -height / 2));
      g.rect(width / 2, -height / 2, lean, height);
      g.fill(TURNED_AWAY_SHADE);

      // Weathering lifts as milling reveals the wood, the same way it
      // does on the face-up board
      if (jointedEdges === 0) {
        g.rect(-width / 2, -height / 2, width, height);
        g.fill({ color: WEATHERED_GRAY, alpha: 0.5 });
      }
      if (jointedFaces === 0 && surface === "rough") {
        g.rect(width / 2, -height / 2, lean, height);
        g.fill({ color: WEATHERED_GRAY, alpha: 0.62 });
      }
    },
    [
      boardWidth,
      boardLength,
      thickness,
      species,
      surface,
      jointedFaces,
      jointedEdges,
      face,
      seed,
    ],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
