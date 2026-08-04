import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

/**
 * A board stood on its long edge, seen from above: the narrow edge face
 * (thickness × length) up, with a sliver of the board's wide face
 * showing down one side the way a standing rail leans its face into
 * view. Same milled-state language as BoardSprite — unjointed edges
 * weather gray, jointing reveals the species' edge color — and the same
 * seeding, so tipping a board up doesn't reroll its character.
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
  } = board;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const width = (thickness / 4) * PIXELS_PER_INCH;
      const height = boardLength * PIXELS_PER_INCH * INCHES_PER_FOOT;
      // The face leans a hair into view beside the edge — enough to read
      // "standing board", never wider than the edge itself.
      const lean = Math.min(width * 0.8, 3);
      const rng = seededRandom(
        seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`,
      );

      const { primary, secondary } = colorBySpecies[species];
      const edgeColor =
        jointedEdges > 0
          ? colorToNumber(secondary)
          : mixColors(secondary, WEATHERED_GRAY, 0.5);
      const faceRevealed = jointedFaces > 0 || surface !== "rough";
      const faceColor = faceRevealed
        ? mixColors(primary, 0x000000, 0.25)
        : mixColors(mixColors(primary, WEATHERED_GRAY, 0.62), 0x000000, 0.25);

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
      g.rect(-width / 2, -height / 2, width, height).fill(edgeColor);
      // The shaded sliver of wide face leaning into view
      g.rect(width / 2, -height / 2, lean, height).fill(faceColor);

      if (jointedEdges > 0) {
        // Straightened: crisp grain lines run the length
        const lines = Math.max(1, Math.round(width / 3));
        for (let i = 0; i < lines; i++) {
          const x =
            -width / 2 +
            (width * (i + 0.5)) / lines +
            (rng() * 2 - 1) * (width * 0.1);
          g.moveTo(x, -height / 2 + 2)
            .lineTo(x + (rng() * 2 - 1) * 1.5, height / 2 - 2)
            .stroke({
              width: 0.8,
              color: mixColors(secondary, 0x000000, 0.25),
              alpha: 0.45,
            });
        }
      } else {
        // Rough: cross marks where the mill's saw chattered
        let y = -height / 2 + 3 + rng() * 5;
        while (y < height / 2 - 3) {
          g.moveTo(-width / 2, y)
            .lineTo(width / 2, y + (rng() * 2 - 1) * 2)
            .stroke({ width: 1, color: 0x000000, alpha: 0.12 });
          y += 5 + rng() * 8;
        }
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
      seed,
    ],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
