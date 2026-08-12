import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { MutableRefObject, useCallback, useMemo, useRef } from "react";
import { CollisionWorld } from "../../game/player-motion";
import { StoreLayout, storeCollisionWorld } from "../../game/store-layout";
import { Vector } from "../../game/Vectors";
import { PIXELS_PER_CELL, cellToPixel } from "../shop-view/shop-scale";
import { playerMotion } from "../world-view/playerMotionStore";
import { Shopper, spawnShoppers, stepShoppers } from "./storeShoppers";

/**
 * Draws and advances the other shoppers (see storeShoppers.ts), the same
 * simple circles the sidewalk's customers are back home. Publishes their
 * positions through `shoppersRef` so the walk layer can treat them as
 * solids without a second source of truth.
 */

const SHIRT_COLORS = [0x9c6b53, 0x53759c, 0x6f9c53, 0x8a539c, 0x9c8f53];
const BODY_RADIUS = PIXELS_PER_CELL * 0.34;

export const StoreShopperLayer: React.FC<{
  layout: StoreLayout;
  paused: boolean;
  shoppersRef: MutableRefObject<ReadonlyArray<Vector>>;
}> = ({ layout, paused, shoppersRef }) => {
  const shoppers = useRef<Shopper[] | null>(null);
  shoppers.current ??= spawnShoppers(layout);
  const world = useMemo<CollisionWorld>(
    () => storeCollisionWorld(layout),
    [layout],
  );

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const nodes = useRef<Array<Graphics | null>>([]);

  useTick((ticker: Ticker) => {
    const crowd = shoppers.current;
    if (!crowd) return;
    if (!pausedRef.current) {
      const dt = Math.min(ticker.deltaMS / 1000, 0.1);
      stepShoppers(crowd, playerMotion.pos, dt, world);
    }
    shoppersRef.current = crowd.map((shopper) => shopper.position);
    crowd.forEach((shopper, index) => {
      const node = nodes.current[index];
      if (node) {
        node.x = cellToPixel(shopper.position[0]);
        node.y = cellToPixel(shopper.position[1]);
      }
    });
  });

  const draw = useCallback((g: Graphics, index: number) => {
    g.clear();
    // Ground shadow, body, head — the sidewalk customers' exact read.
    g.ellipse(0, BODY_RADIUS * 0.35, BODY_RADIUS * 1.1, BODY_RADIUS * 0.55);
    g.fill({ color: 0x000000, alpha: 0.18 });
    g.circle(0, 0, BODY_RADIUS);
    g.fill(SHIRT_COLORS[index % SHIRT_COLORS.length]);
    g.circle(0, 0, BODY_RADIUS * 0.5);
    g.fill(0xd9b38c);
  }, []);

  return (
    <pixiContainer eventMode="none">
      {(shoppers.current ?? []).map((shopper, index) => (
        <pixiGraphics
          key={index}
          ref={(node: Graphics | null) => {
            nodes.current[index] = node;
          }}
          x={cellToPixel(shopper.position[0])}
          y={cellToPixel(shopper.position[1])}
          draw={(g: Graphics) => draw(g, index)}
        />
      ))}
    </pixiContainer>
  );
};
