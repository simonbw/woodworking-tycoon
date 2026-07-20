import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * The shop broom, leaning in the top-left corner. Pure set dressing —
 * the sweep verb works anywhere — but it gives the tutorial's "that
 * broom in the corner" something to point at.
 */
export const BroomSprite: React.FC = () => {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    const x = PIXELS_PER_CELL * 0.22;
    const y = PIXELS_PER_CELL * 0.08;
    // Soft shadow under the bristles
    g.ellipse(x + 2, y + 112, 30, 10);
    g.fill({ color: 0x000000, alpha: 0.2 });
    // Handle, leaning against the wall
    g.moveTo(x + 4, y + 88);
    g.lineTo(x + 44, y);
    g.stroke({ width: 9, color: 0x2c2015 });
    g.moveTo(x + 4, y + 88);
    g.lineTo(x + 44, y);
    g.stroke({ width: 6, color: 0x8a6a45 });
    // Ferrule binding the bristles on
    g.moveTo(x - 4, y + 84);
    g.lineTo(x + 14, y + 94);
    g.stroke({ width: 12, color: 0xb8b0a0 });
    // Bristles, flared at the floor
    g.poly([
      { x: x - 8, y: y + 86 },
      { x: x + 18, y: y + 100 },
      { x: x + 10, y: y + 122 },
      { x: x - 24, y: y + 106 },
    ]);
    g.fill(0xd9c374);
    g.poly([
      { x: x - 8, y: y + 86 },
      { x: x + 18, y: y + 100 },
      { x: x + 10, y: y + 122 },
      { x: x - 24, y: y + 106 },
    ]);
    g.stroke({ width: 2, color: 0x8f7c3a });
    // Bristle strands
    for (const t of [0.25, 0.5, 0.75]) {
      g.moveTo(x - 8 + 26 * t, y + 86 + 14 * t);
      g.lineTo(x - 24 + 34 * t, y + 106 + 16 * t);
      g.stroke({ width: 2, color: 0xbfa855 });
    }
  }, []);

  return <pixiGraphics draw={draw} />;
};
