import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board, defaultBoardFace } from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";
import { seededRandom } from "../../utils/randUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { edgeFill, woodArt } from "./woodFills";

const WEATHERED_GRAY = 0x9a9186;

/**
 * A board standing on edge (as it rides a jointer fence): seen from
 * above only the thin edge face shows — thickness wide, windowed onto
 * the board's own wood, still wavy if the edges haven't been jointed
 * straight yet.
 */
export const OnEdgeBoardSprite: React.FC<{
  board: Omit<Board, "id" | "type">;
  seed?: string;
}> = ({ board, seed }) => {
  const {
    length,
    width: boardWidth,
    thickness,
    species,
    jointedEdges,
    face,
  } = board;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const height = length * PIXELS_PER_INCH;
      const width = Math.max(3, (thickness * PIXELS_PER_INCH) / 4);
      const pieceSeed = seed ?? `${species}-edge-${length}`;
      const rng = seededRandom(pieceSeed);
      const region = face ?? defaultBoardFace(pieceSeed, length, boardWidth);
      const art = woodArt(species, region.seed, thickness);

      // shadow
      g.rect(-width / 2 - 1.5, -height / 2 - 1.5, width + 3, height + 3);
      g.fill({ color: 0x000000, alpha: 0.12 });

      // The up-facing edge, wavy until it's been over the cutterhead
      const amp = jointedEdges > 0 ? 0 : 1;
      const segments = Math.max(2, Math.round(height / 16));
      const left: [number, number][] = [];
      const right: [number, number][] = [];
      for (let i = 0; i <= segments; i++) {
        const y = lerp(-height / 2, height / 2, i / segments);
        left.push([-width / 2 + (rng() * 2 - 1) * amp, y]);
        right.push([width / 2 + (rng() * 2 - 1) * amp, y]);
      }
      const edgePoly = [...left, ...right.reverse()].flat();
      g.poly(edgePoly);
      g.fill(
        edgeFill(art, region, boardWidth, thickness, -width / 2, -height / 2),
      );
      if (jointedEdges === 0) {
        g.poly(edgePoly);
        g.fill({ color: WEATHERED_GRAY, alpha: 0.5 });
      }

      // A darker seam where the face leans away toward the fence
      g.rect(width / 2 - 1, -height / 2, 1, height);
      g.fill({ color: 0x000000, alpha: 0.25 });
    },
    [length, boardWidth, thickness, species, jointedEdges, face, seed],
  );

  return <pixiGraphics draw={draw} />;
};
