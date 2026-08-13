import { useTick } from "@pixi/react";
import { Container, Graphics, Ticker } from "pixi.js";
import React, { useCallback, useMemo, useRef } from "react";
import { CartLine } from "../../game/cart";
import { currentCart } from "../../game/game-actions/cart-actions";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { cellToPixel } from "../shop-view/shop-scale";
import { playerMotion } from "../world-view/playerMotionStore";
import { useGameState } from "../useGameState";

/**
 * The flatbed cart, pushed along in front of the shopper — the big
 * orange lumber cart, not a grocery basket. It rides with the trip from
 * the moment a flatbed is taken from the corral by the entrance
 * (takeCartAction), and the deck carries what the cart actually holds at
 * world size: boards and sheets lying full length (a sheet overhangs the
 * deck the way it overhangs the real thing), boxed goods as their
 * cartons, stacked biggest on the bottom so the load reads as a load.
 *
 * The cart is presentation only: GameState's cart is the list of lines
 * (Person.ts), and this eases toward a point ahead of the body each
 * frame, handle end swinging back toward the hands pushing it.
 */

/** How far ahead of the body the pushed cart rides, in cells. */
const LEAD_DISTANCE = 1.9;

/** How much of the remaining gap the cart closes per second. */
const FOLLOW_RATE = 14;

/** The most the cart ever trails its lead point, in cells — the easing
 * gives it swing through turns, and this cap is what keeps a walking
 * shopper from outrunning it and treading on the deck. */
const MAX_TRAIL = 0.35;

const FRAME = 0xe06010;
const FRAME_DARK = 0xa8490c;
const DECK = 0x6b5637;
const DECK_SEAM = 0x57452c;
const KRAFT = 0xb98d54;
const KRAFT_EDGE = 0x8a6537;

/** The deck, in cells — a real flatbed's four-and-a-half by two and a
 * half feet, long axis toward the handle. */
export const FLATBED_LENGTH_CELLS = 2.3;
export const FLATBED_WIDTH_CELLS = 1.25;

/** An orange flatbed's deck, drawn about its own center with the handle
 * end toward +x. Shared with the corral's nested row
 * (StoreFixturesLayer). */
export function drawFlatbed(g: Graphics): void {
  const l = cellToPixel(FLATBED_LENGTH_CELLS);
  const w = cellToPixel(FLATBED_WIDTH_CELLS);
  // The deck: dark plywood over the frame, seamed down the middle.
  g.roundRect(-l / 2, -w / 2, l, w, 3);
  g.fill(DECK);
  g.rect(-l / 2 + 3, -1, l - 6, 2);
  g.fill(DECK_SEAM);
  // The frame shows as orange rails across both short ends.
  g.rect(-l / 2, -w / 2, 5, w);
  g.rect(l / 2 - 5, -w / 2, 5, w);
  g.fill(FRAME);
}

/** The upright handle past the shopper's end — drawn over the load,
 * because it stands taller than anything lying on the deck. */
export function drawFlatbedHandle(g: Graphics): void {
  const l = cellToPixel(FLATBED_LENGTH_CELLS);
  const w = cellToPixel(FLATBED_WIDTH_CELLS);
  g.rect(l / 2 + 2, -w / 2 + 2, 3.5, w - 4);
  g.fill(FRAME);
  g.rect(l / 2 - 5, -w / 2 + 2, 8, 2.5);
  g.rect(l / 2 - 5, w / 2 - 4.5, 8, 2.5);
  g.fill(FRAME_DARK);
}

/** A line's rough footprint on the deck, in square feet — what decides
 * the stacking order: sheets under boards under boxes. */
function lineFootprint(line: CartLine): number {
  if (line.kind === "machine") return 4;
  if (line.kind !== "material") return 0.8;
  const material = line.material as { length?: number; width?: number };
  if (
    typeof material.length === "number" &&
    typeof material.width === "number"
  ) {
    return (material.length / 12) * (material.width / 12);
  }
  return 1;
}

/** One line of the cart, lying on the deck at world size. */
const CartParcel: React.FC<{ line: CartLine; index: number }> = ({
  line,
  index,
}) => {
  const ox = cellToPixel((((index * 29) % 14) - 7) / 100);
  const oy = cellToPixel((((index * 17) % 22) - 11) / 100);
  const tilt = (((index * 13) % 17) - 8) / 160;
  if (line.kind === "material") {
    return (
      <pixiContainer x={ox} y={oy} rotation={Math.PI / 2 + tilt}>
        <MaterialSprite material={line.material} />
      </pixiContainer>
    );
  }
  // Everything boxed rides as its carton — a machine's is just bigger.
  const big = line.kind === "machine";
  const w = big ? 34 : 15;
  const h = big ? 25 : 12;
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
  const away = gameState.player.away;
  const cart = currentCart(gameState) ?? [];

  // Biggest footprint on the bottom, smallest on top — a stable sort on
  // the line's place in the cart keeps the pile from reshuffling as
  // things are added around it.
  const stacked = useMemo(
    () =>
      cart
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            lineFootprint(b.line) - lineFootprint(a.line) || a.index - b.index,
        ),
    [cart],
  );

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
    drawFlatbed(g);
  }, []);
  const drawHandle = useCallback((g: Graphics) => {
    g.clear();
    drawFlatbedHandle(g);
  }, []);

  if (away?.kind !== "shopping" || !away.hasCart) {
    // The next flatbed snaps into place at the corral rather than easing
    // in from wherever the last one was abandoned.
    placed.current = false;
    return null;
  }

  return (
    <pixiContainer ref={nodeRef} eventMode="none">
      <pixiGraphics draw={draw} />
      {stacked.slice(0, 10).map(({ line, index }) => (
        <CartParcel key={index} line={line} index={index} />
      ))}
      <pixiGraphics draw={drawHandle} />
    </pixiContainer>
  );
};
