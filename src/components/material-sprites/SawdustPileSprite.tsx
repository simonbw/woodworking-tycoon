import { Graphics as PixiGraphics } from "pixi.js";
import React, { useCallback } from "react";
import { dustTotal } from "../../game/Dust";
import { SawdustPile, Species } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { seededRandom } from "../../utils/randUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";

/**
 * A swept-up mound of sawdust: overlapping soft lumps whose colors come
 * from the species mix that was swept (a walnut pile reads dark), sized
 * by how full the pile is. Deterministic per pile id, so it doesn't
 * shimmer between renders.
 */
export const SawdustPileSprite: React.FC<{
  pile: SawdustPile;
  alpha?: number;
  tint?: number;
}> = ({ pile, alpha, tint }) => {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const rng = seededRandom(`sawdust-pile:${pile.id}`);
      const total = dustTotal(pile.contents);
      // Radius grows with contents: a fresh sweep reads small, a full
      // dustpan-load reads like a real mound
      const radius = 8 + Math.min(total / 100, 1) * 14;
      const entries = Object.entries(pile.contents) as Array<[Species, number]>;
      if (entries.length === 0 || total <= 0) {
        return;
      }
      // Base mound in the blended mix color
      const blended = entries.reduce(
        (color, [species, amount]) =>
          mixColors(color, colorBySpecies[species].primary, amount / total),
        0x9a8a70,
      );
      g.circle(0, 0, radius);
      g.fill({ color: blended, alpha: 0.9 });
      // Speckle lumps per species, proportional to their share
      for (const [species, amount] of entries) {
        const lumps = Math.max(2, Math.round((amount / total) * 10));
        const base = colorBySpecies[species].primary;
        for (let i = 0; i < lumps; i++) {
          const angle = rng() * Math.PI * 2;
          const distance = rng() * radius * 0.7;
          g.circle(
            Math.cos(angle) * distance,
            Math.sin(angle) * distance,
            2 + rng() * 3,
          );
          g.fill({
            color: mixColors(base, 0xffffff, 0.1 + rng() * 0.35),
            alpha: 0.9,
          });
        }
      }
    },
    [pile],
  );

  return <pixiGraphics {...omitUndefined({ alpha, tint })} draw={draw} />;
};
