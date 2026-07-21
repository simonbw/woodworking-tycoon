import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { MachineCrate } from "../../game/GameState";
import { PIXELS_PER_CELL, cellToPixelCenter } from "./shop-scale";

/**
 * A machine delivery still in its crate: a stenciled pine box sitting on
 * the floor. Crates don't block walking — the player stands on one and
 * unpacks it straight into their arms (see docs/carrying-machines.md).
 */
export const MachineCrateSprite: React.FC<{ crate: MachineCrate }> = ({
  crate,
}) => {
  const [x, y] = cellToPixelCenter(crate.position);

  const draw = useCallback((g: Graphics) => {
    g.clear();
    const half = PIXELS_PER_CELL * 0.34;

    // The lid
    g.rect(-half, -half, half * 2, half * 2);
    g.fill(0xc9a86a);
    g.rect(-half, -half, half * 2, half * 2);
    g.stroke({ width: 3, color: 0x8a6f42 });

    // Plank seams
    for (const offset of [-half / 2, 0, half / 2]) {
      g.moveTo(-half, offset);
      g.lineTo(half, offset);
      g.stroke({ width: 1.5, color: 0x8a6f42 });
    }

    // Cross braces nailed over the lid
    g.moveTo(-half, -half);
    g.lineTo(half, half);
    g.stroke({ width: 3, color: 0xa8895a });
    g.moveTo(half, -half);
    g.lineTo(-half, half);
    g.stroke({ width: 3, color: 0xa8895a });

    // Corner nail heads
    for (const [nx, ny] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      g.circle(nx * (half - 5), ny * (half - 5), 2);
      g.fill(0x5c4a2e);
    }
  }, []);

  return (
    <pixiContainer x={x} y={y}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};
