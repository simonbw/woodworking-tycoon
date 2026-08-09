import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

/**
 * Two folding sawhorses seen from above, standing a couple of feet
 * apart across the span. Deliberately drawn as the bare horses: what
 * lies across them is the sheet on the machine, rendered by
 * MachineMaterials like any other staged stock, so an empty pair reads
 * as empty from across the shop.
 *
 * Procedural on purpose for now — see docs/asset-backlog.md.
 */
export const SawhorsesSprite: React.FC<{ machine: Machine }> = () => {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    const cell = PIXELS_PER_CELL;
    // Footprint is 3×2 cells; art is drawn about the footprint center.
    const halfW = cell * 1.5;
    const halfH = cell;
    const beamHalf = halfW * 0.92;
    const legSpread = halfH * 0.72;

    // Each horse: a top beam running the span, with splayed legs whose
    // feet show past it on both sides.
    for (const y of [-halfH * 0.45, halfH * 0.45]) {
      // Shadow
      g.roundRect(-beamHalf + 3, y - 4 + 4, beamHalf * 2, 9, 3);
      g.fill({ color: 0x000000, alpha: 0.16 });

      // Legs, splayed out from four points along the beam
      for (const x of [-beamHalf * 0.78, beamHalf * 0.78]) {
        for (const spread of [-legSpread, legSpread]) {
          g.moveTo(x, y);
          g.lineTo(x + (x < 0 ? -6 : 6), y + spread);
          g.stroke({ width: 5, color: 0x8a6a44 });
        }
      }

      // The beam itself
      g.roundRect(-beamHalf, y - 4, beamHalf * 2, 9, 3);
      g.fill(0xc19a63);
      g.roundRect(-beamHalf, y - 4, beamHalf * 2, 9, 3);
      g.stroke({ width: 1.5, color: 0x8a6a44 });
      // The worn stripe down the middle where everything gets cut
      g.moveTo(-beamHalf + 4, y + 0.5);
      g.lineTo(beamHalf - 4, y + 0.5);
      g.stroke({ width: 1, color: 0xa8834f, alpha: 0.8 });
    }
  }, []);

  return <pixiGraphics draw={draw} />;
};
