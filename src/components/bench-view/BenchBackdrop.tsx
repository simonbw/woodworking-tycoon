import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { mixColors } from "../../utils/colorUtils";
import { seededRandom } from "../../utils/randUtils";

/**
 * The bench top itself: laminated planks running the long way, worn and
 * warm, with a darker tool rail band along the top edge where the
 * mounted tools hang. Pure decoration drawn once per resize — the wood
 * everything else in the bench view sits on, so the view reads as a
 * surface instead of a sheet of paper.
 */

/** The rail band's height in px — BenchWorkSurface lays the DOM tool
 * buttons over exactly this strip. */
export const TOOL_RAIL_HEIGHT = 64;

const PLANK_BASE = 0xb08a5e;
const PLANK_EDGE = 0x7d5f3f;
const RAIL_BASE = 0x5d4630;

export const BenchBackdrop: React.FC<{
  width: number;
  height: number;
  /** Whether to shade the tool rail band (benches with tool slots). */
  rail: boolean;
}> = ({ width, height, rail }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const rng = seededRandom("bench-top");

      // Laminated planks running the length of the bench
      const plankHeight = 46;
      for (let y = 0, i = 0; y < height; y += plankHeight, i++) {
        const tone = mixColors(
          PLANK_BASE,
          i % 2 === 0 ? 0xffffff : 0x000000,
          0.03 + rng() * 0.05,
        );
        g.rect(0, y, width, plankHeight).fill(tone);
        // Seam between planks
        g.moveTo(0, y)
          .lineTo(width, y)
          .stroke({ width: 1.5, color: PLANK_EDGE, alpha: 0.55 });
        // A few long grain lines per plank
        const grainLines = 3 + Math.floor(rng() * 3);
        for (let l = 0; l < grainLines; l++) {
          const gy = y + 6 + rng() * (plankHeight - 12);
          const wander = (rng() * 2 - 1) * 6;
          g.moveTo(-10, gy).bezierCurveTo(
            width * 0.33,
            gy + wander,
            width * 0.66,
            gy - wander,
            width + 10,
            gy + (rng() * 2 - 1) * 4,
          );
          g.stroke({ width: 1, color: PLANK_EDGE, alpha: 0.14 + rng() * 0.1 });
        }
        // The odd dowel plug at a plank seam
        if (rng() < 0.5) {
          g.circle(rng() * width, y + plankHeight / 2, 3.5).fill({
            color: PLANK_EDGE,
            alpha: 0.35,
          });
        }
      }

      // Wear: pale scuffs where work happens, center of the surface
      for (let s = 0; s < 5; s++) {
        g.ellipse(
          width * (0.2 + rng() * 0.6),
          height * (0.35 + rng() * 0.4),
          40 + rng() * 90,
          10 + rng() * 22,
        ).fill({ color: 0xffffff, alpha: 0.035 });
      }

      // Soft edge vignette so the surface reads as lit from above
      g.rect(0, 0, width, 10).fill({ color: 0x000000, alpha: 0.12 });
      g.rect(0, height - 12, width, 12).fill({ color: 0x000000, alpha: 0.16 });
      g.rect(0, 0, 8, height).fill({ color: 0x000000, alpha: 0.1 });
      g.rect(width - 8, 0, 8, height).fill({ color: 0x000000, alpha: 0.1 });

      if (rail) {
        // The tool rail: a darker batten across the top, shadowed below
        g.rect(0, 0, width, TOOL_RAIL_HEIGHT).fill({
          color: RAIL_BASE,
          alpha: 0.88,
        });
        g.rect(0, TOOL_RAIL_HEIGHT - 3, width, 3).fill({
          color: 0x000000,
          alpha: 0.3,
        });
        g.rect(0, TOOL_RAIL_HEIGHT, width, 6).fill({
          color: 0x000000,
          alpha: 0.12,
        });
        // Hanger holes marching along the batten
        for (let x = 24; x < width - 12; x += 48) {
          g.circle(x, 12, 2).fill({ color: 0x000000, alpha: 0.35 });
        }
      }
    },
    [width, height, rail],
  );

  return <pixiGraphics draw={draw} />;
};
