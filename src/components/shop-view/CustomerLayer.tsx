import { Graphics } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { useTick } from "@pixi/react";
import { Container } from "pixi.js";
import { Customer, sidewalkY, standCenter } from "../../game/stand";
import { useGameState } from "../useGameState";
import { cellToPixel, PIXELS_PER_CELL } from "./shop-scale";

/**
 * The people out walking past the lot, drawn as simple circles for now
 * (see docs/asset-backlog.md). Their positions live in GameState and
 * step forward once per tick, so each sprite eases toward its simulated
 * spot every frame — the same trick the player's own between-tick motion
 * uses, minus the physics. A browsing customer drifts up off the
 * sidewalk line toward the table.
 */

/** How much of the remaining gap a sprite closes per second. */
const EASE_PER_SECOND = 8;

/** How far a browsing customer steps up toward the table, in cells. */
const BROWSE_STEP = 0.9;

const SHIRT_COLORS = [0x9c6b53, 0x53759c, 0x6f9c53, 0x8a539c, 0x9c8f53];

const CUSTOMER_RADIUS = PIXELS_PER_CELL * 0.32;

export const CustomerLayer: React.FC = () => {
  const gameState = useGameState();
  return (
    <pixiContainer eventMode="none">
      {gameState.customers.map((customer) => (
        <CustomerSprite key={customer.id} customer={customer} />
      ))}
    </pixiContainer>
  );
};

const CustomerSprite: React.FC<{ customer: Customer }> = ({ customer }) => {
  const gameState = useGameState();
  const ref = useRef<Container>(null);
  const walkY = sidewalkY(gameState.shopInfo);
  const browsing = customer.state === "browsing";
  const targetX = cellToPixel(
    browsing ? standCenter(gameState.shopInfo)[0] : customer.x,
  );
  const targetY = cellToPixel(browsing ? walkY - BROWSE_STEP : walkY);
  // Snap to the spawn point on first mount, then ease ever after.
  const placed = useRef(false);

  useTick((ticker) => {
    const node = ref.current;
    if (!node) return;
    if (!placed.current) {
      node.position.set(targetX, targetY);
      placed.current = true;
      return;
    }
    const k = Math.min(1, (ticker.deltaMS / 1000) * EASE_PER_SECOND);
    node.position.set(
      node.position.x + (targetX - node.position.x) * k,
      node.position.y + (targetY - node.position.y) * k,
    );
  });

  // A hash of the id keeps each walker's color stable across renders
  // without storing cosmetics in GameState.
  const hue =
    SHIRT_COLORS[
      Math.abs(
        [...customer.id].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7),
      ) % SHIRT_COLORS.length
    ];

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      // Ground shadow, body, head — read top-down like the player does
      g.ellipse(
        0,
        CUSTOMER_RADIUS * 0.35,
        CUSTOMER_RADIUS * 1.1,
        CUSTOMER_RADIUS * 0.55,
      );
      g.fill({ color: 0x000000, alpha: 0.18 });
      g.circle(0, 0, CUSTOMER_RADIUS);
      g.fill(hue);
      g.circle(0, 0, CUSTOMER_RADIUS * 0.5);
      g.fill(0xd9b38c);
    },
    [hue],
  );

  return (
    <pixiContainer ref={ref}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};
