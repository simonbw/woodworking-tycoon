import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { seededRandom } from "../../utils/randUtils";
import {
  colorBySheetGoodKind,
  colorBySpecies,
  osbFlakeColors,
} from "../shop-view/colorBySpecies";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

/** What color a slat of parked stock reads as from above. */
function storedStockColor(material: MaterialInstance): number {
  if ("species" in material) {
    return colorToNumber(colorBySpecies[material.species].primary);
  }
  if (material.type === "plywood") {
    return colorToNumber(colorBySheetGoodKind[material.kind].primary);
  }
  return 0x9a8062;
}

/**
 * The storage rack: an OSB deck on corner posts, drawn from above. Parked
 * stock (storedMaterials) piles up as slats across the deck, so a loaded
 * rack looks loaded from across the shop.
 */
export const StorageRackSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const stored = machine.storedMaterials;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const half = PIXELS_PER_CELL * 0.42;
      const size = half * 2;
      const rng = seededRandom("storage-rack");

      // Drop shadow toward the lower right
      g.roundRect(-half + 4, -half + 5, size, size, 5);
      g.fill({ color: 0x000000, alpha: 0.18 });

      // Corner posts peeking out from under the deck
      const post = PIXELS_PER_CELL * 0.14;
      for (const [px, py] of [
        [-half + 1, -half + 1],
        [half - post - 1, -half + 1],
        [-half + 1, half - post - 1],
        [half - post - 1, half - post - 1],
      ]) {
        g.rect(px - 1.5, py - 1.5, post + 3, post + 3);
        g.fill({ color: 0x5c3b1e });
      }

      // The OSB deck, strands and all, inset so the posts peek out
      const deckInset = 4;
      const deck = half - deckInset;
      const deckBase = mixColors(
        colorBySheetGoodKind.osb.primary,
        0x000000,
        0.2,
      );
      g.roundRect(-deck, -deck, deck * 2, deck * 2, 4);
      g.fill(deckBase);
      for (let i = 0; i < 70; i++) {
        const cx = -deck + 3 + rng() * (deck * 2 - 6);
        const cy = -deck + 3 + rng() * (deck * 2 - 6);
        const w = 3 + rng() * 5;
        const h = 1.5 + rng() * 2;
        g.rect(cx - w / 2, cy - h / 2, w, h);
        g.fill({
          color: osbFlakeColors[Math.floor(rng() * osbFlakeColors.length)],
          alpha: 0.85,
        });
      }
      g.roundRect(-deck, -deck, deck * 2, deck * 2, 4);
      g.stroke({ width: 2, color: 0x6b4a26 });

      // Parked stock stacks up as slats across the deck
      const slots = Math.min(stored.length, 8);
      for (let i = 0; i < slots; i++) {
        const slatLength = size * (0.62 + rng() * 0.2);
        const y = -half + 8 + (i * (size - 18)) / 8;
        const x = -slatLength / 2 + (rng() * 2 - 1) * 4;
        g.rect(x, y, slatLength, 5);
        g.fill(storedStockColor(stored[i]));
        g.rect(x, y, slatLength, 5);
        g.stroke({ width: 1, color: 0x000000, alpha: 0.25 });
      }
    },
    [stored],
  );

  return <pixiGraphics draw={draw} />;
};
