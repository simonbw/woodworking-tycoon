import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { canisterFillFraction } from "../../game/ShopVac";
import { GameState } from "../../game/GameState";
import { useGameState } from "../useGameState";
import { playerMotion } from "./playerMotionStore";
import { cellToPixel, cellToPixelCenter, PIXELS_PER_CELL } from "./shop-scale";

/** How quickly the dragged vac closes on its spot behind the player. */
const FOLLOW_RATE = 10;

/**
 * The shop vac: a squat canister drum on casters. Parked, it sits on its
 * cell; while the player drags it, it trails half a cell behind them
 * with the hose stretched to their hand — following the continuous body
 * (playerMotionStore), redrawn each frame in useTick. The drum's window
 * shows how full the canister is.
 */
export const ShopVacSprite: React.FC = () => {
  const gameState = useGameState();
  const stateRef = useRef<GameState>(gameState);
  stateRef.current = gameState;
  const graphicsRef = useRef<Graphics>(null);
  // The dragged drum's current pixel position, eased toward its target so
  // direction changes swing it around instead of teleporting it.
  const dragPos = useRef<[number, number] | null>(null);

  useTick((ticker: Ticker) => {
    const g = graphicsRef.current;
    const vac = stateRef.current.shopVac;
    if (!g) return;
    g.clear();
    if (!vac) return;

    const carried = vac.position === null;
    const playerCenter: [number, number] = [
      cellToPixel(playerMotion.pos[0]),
      cellToPixel(playerMotion.pos[1]),
    ];

    let x: number;
    let y: number;
    if (carried) {
      const targetX =
        playerCenter[0] -
        Math.cos(playerMotion.heading) * PIXELS_PER_CELL * 0.55;
      const targetY =
        playerCenter[1] -
        Math.sin(playerMotion.heading) * PIXELS_PER_CELL * 0.55;
      const dt = ticker.deltaMS / 1000;
      const ease = Math.min(1, dt * FOLLOW_RATE);
      const previous = dragPos.current ?? [targetX, targetY];
      x = previous[0] + (targetX - previous[0]) * ease;
      y = previous[1] + (targetY - previous[1]) * ease;
      dragPos.current = [x, y];
    } else {
      dragPos.current = null;
      [x, y] = cellToPixelCenter(vac.position!);
    }

    const radius = PIXELS_PER_CELL * 0.21;
    // Shadow, casters
    g.ellipse(x, y + radius * 0.45, radius * 1.15, radius * 0.55);
    g.fill({ color: 0x000000, alpha: 0.22 });
    // Drum
    g.circle(x, y, radius);
    g.fill(0x3d4855);
    g.circle(x, y, radius);
    g.stroke({ width: 2.5, color: 0x262e38 });
    // Canister window: fills amber-brown as dust comes aboard
    const fill = canisterFillFraction(vac);
    g.circle(x, y, radius * 0.62);
    g.fill(0x1c2128);
    if (fill > 0) {
      const inner = radius * 0.62;
      const top = y + inner - 2 * inner * fill;
      g.rect(x - inner, top, inner * 2, y + inner - top);
      g.fill({ color: 0xa8895c, alpha: 0.95 });
      // Clip the fill back to the round window
      g.circle(x, y, radius * 0.62);
      g.stroke({ width: inner * 0.8, color: 0x3d4855 });
      g.circle(x, y, radius * 0.62 + 1);
      g.stroke({ width: 2, color: 0x262e38 });
    }
    // Lid handle
    g.rect(x - radius * 0.35, y - radius - 4, radius * 0.7, 4);
    g.fill(0xd97706);

    // Hose to the player's hand while dragging
    if (carried) {
      const midX = (x + playerCenter[0]) / 2;
      const midY = (y + playerCenter[1]) / 2 - 10;
      g.moveTo(x, y - radius * 0.5);
      g.quadraticCurveTo(midX, midY, playerCenter[0], playerCenter[1]);
      g.stroke({ width: 5, color: 0x262e38 });
      g.moveTo(x, y - radius * 0.5);
      g.quadraticCurveTo(midX, midY, playerCenter[0], playerCenter[1]);
      g.stroke({ width: 3, color: 0x4a5866 });
    }
  });

  if (!gameState.shopVac) {
    return null;
  }
  // All real drawing happens per-frame in useTick; the draw prop is just
  // the required initial paint.
  return <pixiGraphics ref={graphicsRef} draw={(g) => g.clear()} />;
};
