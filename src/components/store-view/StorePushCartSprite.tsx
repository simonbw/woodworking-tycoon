import { useTick } from "@pixi/react";
import { Container, Graphics, Ticker } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { currentCart } from "../../game/game-actions/cart-actions";
import { cellToPixel } from "../shop-view/shop-scale";
import { playerMotion } from "../world-view/playerMotionStore";
import { useGameState } from "../useGameState";

/**
 * The shopping cart itself, rolling along at the shopper's heels. It
 * appears with the first thing set in it — there is no fetch-a-cart
 * errand, which would be hassle without depth — and what's in the basket
 * is drawn as parcels so a loaded cart looks loaded at a glance.
 *
 * The trail is presentation only: GameState's cart is the list of lines
 * (Person.ts), and this eases toward a point behind the body each frame
 * the way the vac canister trails back home.
 */

/** How far behind the body the cart trails, in cells. */
const TRAIL_DISTANCE = 1.45;

/** How much of the remaining gap the cart closes per second. */
const FOLLOW_RATE = 7;

const BASKET = 0x8b9094;
const BASKET_RIM = 0xb9bec2;
const HANDLE = 0xe06010;
const PARCEL = 0x9a7648;
const PARCEL_EDGE = 0x71542f;

const CART_WIDTH_CELLS = 1.6;
const CART_DEPTH_CELLS = 1.0;

export const StorePushCartSprite: React.FC = () => {
  const gameState = useGameState();
  const cartCount = (currentCart(gameState) ?? []).length;

  const nodeRef = useRef<Container>(null);
  const placed = useRef(false);

  useTick((ticker: Ticker) => {
    const node = nodeRef.current;
    if (!node) return;
    const behind: [number, number] = [
      playerMotion.pos[0] - Math.cos(playerMotion.heading) * TRAIL_DISTANCE,
      playerMotion.pos[1] - Math.sin(playerMotion.heading) * TRAIL_DISTANCE,
    ];
    const targetX = cellToPixel(behind[0]);
    const targetY = cellToPixel(behind[1]);
    if (!placed.current) {
      node.position.set(targetX, targetY);
      placed.current = true;
    } else {
      const k = Math.min(1, (ticker.deltaMS / 1000) * FOLLOW_RATE);
      node.position.set(
        node.position.x + (targetX - node.position.x) * k,
        node.position.y + (targetY - node.position.y) * k,
      );
    }
    // The cart points at the person pulling it.
    node.rotation = Math.atan2(
      cellToPixel(playerMotion.pos[1]) - node.position.y,
      cellToPixel(playerMotion.pos[0]) - node.position.x,
    );
  });

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = cellToPixel(CART_WIDTH_CELLS);
      const d = cellToPixel(CART_DEPTH_CELLS);
      // Basket, drawn nose toward +x (the handle end faces the shopper).
      g.roundRect(-w / 2, -d / 2, w, d, 5);
      g.fill(BASKET);
      g.roundRect(-w / 2, -d / 2, w, d, 5);
      g.stroke({ width: 2.5, color: BASKET_RIM });
      // The handle bar across the shopper's end.
      g.rect(w / 2 - 3, -d / 2 - 3, 4, d + 6);
      g.fill(HANDLE);
      // Parcels: one lump per couple of lines, packed from the front.
      const parcels = Math.min(6, Math.ceil(cartCount / 2));
      for (let i = 0; i < parcels; i++) {
        const px = -w / 2 + 7 + (i % 3) * ((w - 18) / 3);
        const py = -d / 2 + 6 + Math.floor(i / 3) * ((d - 12) / 2);
        g.rect(px, py, (w - 22) / 3, (d - 14) / 2);
        g.fill(PARCEL);
        g.rect(px, py, (w - 22) / 3, (d - 14) / 2);
        g.stroke({ width: 1, color: PARCEL_EDGE });
      }
    },
    [cartCount],
  );

  if (cartCount === 0) {
    // Next appearance snaps into place rather than easing in from the
    // stale spot the last cart was abandoned at.
    placed.current = false;
    return null;
  }

  return (
    <pixiContainer ref={nodeRef} eventMode="none">
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};
