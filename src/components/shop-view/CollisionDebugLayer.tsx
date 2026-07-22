import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { useCellMap } from "../../game/CellMap";
import { cellObstruction } from "../../game/machine-collision";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Dev overlay (load the game with `?collision`): paints the exact solid
 * area the movement sweep collides against in each blocked cell, so
 * generated and hand-set collision boxes can be checked by eye instead of
 * by walking into them.
 */
export const CollisionDebugLayer: React.FC = () => {
  const cellMap = useCellMap();

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const cell of cellMap.getCells()) {
        const insets = cellObstruction(cell, cell.position);
        if (insets === undefined) continue;
        const [cx, cy] = cell.position;
        const x = (cx + insets.left) * PIXELS_PER_CELL;
        const y = (cy + insets.top) * PIXELS_PER_CELL;
        const width = (1 - insets.left - insets.right) * PIXELS_PER_CELL;
        const height = (1 - insets.top - insets.bottom) * PIXELS_PER_CELL;
        g.rect(x, y, width, height);
        g.fill({ color: 0xef4444, alpha: 0.25 });
        g.rect(x, y, width, height);
        g.stroke({ width: 1.5, color: 0xef4444, alpha: 0.9 });
      }
    },
    [cellMap],
  );

  return <pixiGraphics draw={draw} />;
};

/** Whether the collision overlay was requested in the page URL. */
export function collisionDebugRequested(): boolean {
  return new URLSearchParams(window.location.search).has("collision");
}
