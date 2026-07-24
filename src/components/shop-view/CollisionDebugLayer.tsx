import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { getMachines } from "../../game/Machine";
import { shopSolids } from "../../game/machine-collision";
import { useGameState } from "../useGameState";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Dev overlay (load the game with `?collision`): paints the exact solid
 * boxes the movement sweep collides against, so generated and hand-set
 * collision boxes can be checked by eye instead of by walking into them.
 */
export const CollisionDebugLayer: React.FC = () => {
  const gameState = useGameState();

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const solid of shopSolids(getMachines(gameState.machines))) {
        const x = solid.min[0] * PIXELS_PER_CELL;
        const y = solid.min[1] * PIXELS_PER_CELL;
        const width = (solid.max[0] - solid.min[0]) * PIXELS_PER_CELL;
        const height = (solid.max[1] - solid.min[1]) * PIXELS_PER_CELL;
        g.rect(x, y, width, height);
        g.fill({ color: 0xef4444, alpha: 0.25 });
        g.rect(x, y, width, height);
        g.stroke({ width: 1.5, color: 0xef4444, alpha: 0.9 });
      }
    },
    [gameState.machines],
  );

  return <pixiGraphics draw={draw} />;
};

/** Whether the collision overlay was requested in the page URL. */
export function collisionDebugRequested(): boolean {
  return new URLSearchParams(window.location.search).has("collision");
}
