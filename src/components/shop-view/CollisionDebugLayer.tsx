import { useTick } from "@pixi/react";
import { Graphics } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { collisionWorld } from "../../game/machine-collision";
import { PLAYER_RADIUS } from "../../game/player-motion";
import { useGameState } from "../useGameState";
import { playerMotion } from "./playerMotionStore";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Dev overlay (load the game with `?collision`): paints the exact solids
 * the movement step collides against — boxes and circles — plus the
 * player's body circle, so generated and hand-set collision shapes can
 * be checked by eye instead of by walking into them.
 */
export const CollisionDebugLayer: React.FC = () => {
  const gameState = useGameState();

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const solid of collisionWorld(gameState).solids) {
        if (solid.kind === "circle") {
          const x = solid.center[0] * PIXELS_PER_CELL;
          const y = solid.center[1] * PIXELS_PER_CELL;
          const radius = solid.radius * PIXELS_PER_CELL;
          g.circle(x, y, radius);
          g.fill({ color: 0xef4444, alpha: 0.25 });
          g.circle(x, y, radius);
          g.stroke({ width: 1.5, color: 0xef4444, alpha: 0.9 });
          continue;
        }
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
    [gameState],
  );

  return (
    <>
      <pixiGraphics draw={draw} />
      <PlayerBodyDebugSprite />
    </>
  );
};

/**
 * The body circle the solids push against, following the continuous
 * position every frame (the motion store, not GameState — that's the
 * point: this is the thing that actually collides).
 */
const PlayerBodyDebugSprite: React.FC = () => {
  const graphicsRef = useRef<Graphics>(null);

  useTick(() => {
    const g = graphicsRef.current;
    if (!g) return;
    g.clear();
    const x = playerMotion.pos[0] * PIXELS_PER_CELL;
    const y = playerMotion.pos[1] * PIXELS_PER_CELL;
    g.circle(x, y, PLAYER_RADIUS * PIXELS_PER_CELL);
    g.stroke({ width: 1.5, color: 0x22d3ee, alpha: 0.9 });
    g.circle(x, y, 2);
    g.fill({ color: 0x22d3ee, alpha: 0.9 });
  });

  return <pixiGraphics ref={graphicsRef} draw={() => {}} />;
};

/** Whether the collision overlay was requested in the page URL. */
export function collisionDebugRequested(): boolean {
  return new URLSearchParams(window.location.search).has("collision");
}
