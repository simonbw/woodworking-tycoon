import { useTick } from "@pixi/react";
import { Container, Graphics, Ticker } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { CartLine } from "../../game/cart";
import { currentCart } from "../../game/game-actions/cart-actions";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { cellToPixel } from "../shop-view/shop-scale";
import { playerMotion } from "../world-view/playerMotionStore";
import { useGameState } from "../useGameState";

/**
 * The shopping cart itself, pushed along in front of the shopper. It
 * appears with the first thing set in it — there is no fetch-a-cart
 * errand, which would be hassle without depth — and the basket carries
 * what the cart actually holds: the boards and sheets at a hand-truck
 * scale, boxed goods as their cartons, so a loaded cart reads at a
 * glance.
 *
 * The cart is presentation only: GameState's cart is the list of lines
 * (Person.ts), and this eases toward a point ahead of the body each
 * frame, handle end swinging back toward the hands pushing it.
 */

/** How far ahead of the body the pushed cart rides, in cells. */
const LEAD_DISTANCE = 1.45;

/** How much of the remaining gap the cart closes per second. */
const FOLLOW_RATE = 14;

/** The most the cart ever trails its lead point, in cells — the easing
 * gives it swing through turns, and this cap is what keeps a walking
 * shopper from outrunning it and treading on the basket. */
const MAX_TRAIL = 0.35;

const BASKET = 0x8b9094;
const BASKET_RIM = 0xb9bec2;
const HANDLE = 0xe06010;
const KRAFT = 0xb98d54;
const KRAFT_EDGE = 0x8a6537;

const CART_WIDTH_CELLS = 1.6;
const CART_DEPTH_CELLS = 1.0;

/** How big the basket draws its stock, relative to the world. */
const PARCEL_SCALE = 0.3;

/** One line of the cart, lying in the basket. */
const CartParcel: React.FC<{ line: CartLine; index: number }> = ({
  line,
  index,
}) => {
  const ox = cellToPixel(((index % 3) - 1) * 0.14);
  const oy = cellToPixel((((index * 29) % 40) - 20) / 90);
  const tilt = (((index * 13) % 17) - 8) / 60;
  if (line.kind === "material") {
    return (
      <pixiContainer
        x={ox}
        y={oy}
        rotation={Math.PI / 2 + tilt}
        scale={PARCEL_SCALE}
      >
        <MaterialSprite material={line.material} />
      </pixiContainer>
    );
  }
  // Everything boxed rides as its carton — a machine's is just bigger.
  const big = line.kind === "machine";
  const w = big ? 30 : 14;
  const h = big ? 22 : 11;
  return (
    <pixiContainer x={ox} y={oy} rotation={tilt}>
      <pixiGraphics
        draw={(g: Graphics) => {
          g.clear();
          g.rect(-w / 2, -h / 2, w, h);
          g.fill(KRAFT);
          g.rect(-w / 2, -h / 2, w, h);
          g.stroke({ width: 1.5, color: KRAFT_EDGE });
          g.rect(-w / 2, -1, w, 2);
          g.fill(KRAFT_EDGE);
        }}
      />
    </pixiContainer>
  );
};

export const StorePushCartSprite: React.FC = () => {
  const gameState = useGameState();
  const cart = currentCart(gameState) ?? [];

  const nodeRef = useRef<Container>(null);
  const placed = useRef(false);

  useTick((ticker: Ticker) => {
    const node = nodeRef.current;
    if (!node) return;
    const ahead: [number, number] = [
      playerMotion.pos[0] + Math.cos(playerMotion.heading) * LEAD_DISTANCE,
      playerMotion.pos[1] + Math.sin(playerMotion.heading) * LEAD_DISTANCE,
    ];
    const targetX = cellToPixel(ahead[0]);
    const targetY = cellToPixel(ahead[1]);
    if (!placed.current) {
      node.position.set(targetX, targetY);
      placed.current = true;
    } else {
      const k = Math.min(1, (ticker.deltaMS / 1000) * FOLLOW_RATE);
      let x = node.position.x + (targetX - node.position.x) * k;
      let y = node.position.y + (targetY - node.position.y) * k;
      // Never trail farther than the cap — a body at full stride keeps
      // its cart at arm's length instead of walking up its back.
      const trail = Math.hypot(targetX - x, targetY - y);
      const maxTrail = cellToPixel(MAX_TRAIL);
      if (trail > maxTrail) {
        const pull = (trail - maxTrail) / trail;
        x += (targetX - x) * pull;
        y += (targetY - y) * pull;
      }
      node.position.set(x, y);
    }
    // The handle end swings back toward the person pushing it.
    node.rotation = Math.atan2(
      cellToPixel(playerMotion.pos[1]) - node.position.y,
      cellToPixel(playerMotion.pos[0]) - node.position.x,
    );
  });

  const draw = useCallback((g: Graphics) => {
    g.clear();
    const w = cellToPixel(CART_WIDTH_CELLS);
    const d = cellToPixel(CART_DEPTH_CELLS);
    // Basket, drawn nose toward +x (the handle end faces the shopper).
    g.roundRect(-w / 2, -d / 2, w, d, 5);
    g.fill(BASKET);
  }, []);

  // The rim and handle draw back over the load, so a cart under a full
  // sheet still reads as a cart and not a runaway panel.
  const drawRim = useCallback((g: Graphics) => {
    g.clear();
    const w = cellToPixel(CART_WIDTH_CELLS);
    const d = cellToPixel(CART_DEPTH_CELLS);
    g.roundRect(-w / 2, -d / 2, w, d, 5);
    g.stroke({ width: 2.5, color: BASKET_RIM });
    // The handle bar across the shopper's end.
    g.rect(w / 2 - 3, -d / 2 - 3, 4, d + 6);
    g.fill(HANDLE);
  }, []);

  if (cart.length === 0) {
    // Next appearance snaps into place rather than easing in from the
    // stale spot the last cart was abandoned at.
    placed.current = false;
    return null;
  }

  return (
    <pixiContainer ref={nodeRef} eventMode="none">
      <pixiGraphics draw={draw} />
      {cart.slice(0, 8).map((line, index) => (
        <CartParcel key={index} line={line} index={index} />
      ))}
      <pixiGraphics draw={drawRim} />
    </pixiContainer>
  );
};
