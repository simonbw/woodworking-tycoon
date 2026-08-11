import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { colorToNumber } from "../../utils/colorUtils";
import { seededRandom } from "../../utils/randUtils";
import {
  colorBySheetGoodKind,
  colorBySpecies,
} from "../shop-view/colorBySpecies";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

/** What color a board of parked stock reads as from above. */
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
 * The starter lumber shelf: a single plank on short legs, drawn from
 * above. Parked stock (storedMaterials) lies as boards along the plank,
 * so a loaded shelf looks loaded from across the shop.
 */
export const LumberShelfSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const stored = machine.storedMaterials;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const halfW = PIXELS_PER_CELL * 0.94;
      const halfH = PIXELS_PER_CELL * 0.44;
      const rng = seededRandom("lumber-shelf");

      // Drop shadow toward the lower right
      g.roundRect(-halfW + 3, -halfH + 4, halfW * 2, halfH * 2, 4);
      g.fill({ color: 0x000000, alpha: 0.18 });

      // Legs peeking out from under the plank at the corners
      const leg = PIXELS_PER_CELL * 0.22;
      for (const [px, py] of [
        [-halfW + 1, -halfH + 1],
        [halfW - leg - 1, -halfH + 1],
        [-halfW + 1, halfH - leg - 1],
        [halfW - leg - 1, halfH - leg - 1],
      ]) {
        g.rect(px - 1.5, py - 1.5, leg + 3, leg + 3);
        g.fill({ color: 0x5c3b1e });
      }

      // The plank itself, inset so the legs peek out, with a faint grain
      const inset = 3;
      const deckW = halfW - inset;
      const deckH = halfH - inset;
      g.roundRect(-deckW, -deckH, deckW * 2, deckH * 2, 3);
      g.fill(0x8a6a44);
      for (let i = 0; i < 8; i++) {
        const y = -deckH + 2 + rng() * (deckH * 2 - 4);
        const x = -deckW + 2 + rng() * (deckW * 0.8);
        const w = deckW * (0.5 + rng() * 0.9);
        g.rect(x, y, Math.min(w, deckW * 2 - 4), 1);
        g.fill({ color: 0x6b4a26, alpha: 0.5 });
      }
      g.roundRect(-deckW, -deckH, deckW * 2, deckH * 2, 3);
      g.stroke({ width: 2, color: 0x6b4a26 });

      // Parked stock lies as boards along the shelf
      const slots = Math.min(stored.length, 4);
      for (let i = 0; i < slots; i++) {
        const boardLength = halfW * 2 * (0.62 + rng() * 0.2);
        const y = -halfH + 6 + (i * (halfH * 2 - 12)) / 4;
        const x = -boardLength / 2 + (rng() * 2 - 1) * 3;
        g.rect(x, y, boardLength, 4);
        g.fill(storedStockColor(stored[i]));
        g.rect(x, y, boardLength, 4);
        g.stroke({ width: 1, color: 0x000000, alpha: 0.25 });
      }
    },
    [stored],
  );

  // Centered on the 2×1-ft footprint: half a cell past the origin in x,
  // on-center in y.
  return (
    <pixiContainer x={PIXELS_PER_CELL * 0.5} y={0}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};
