import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { canisterFillFraction, canisterRoom } from "../../game/ShopVac";
import { GameState } from "../../game/GameState";
import { useGameState } from "../useGameState";
import { playerMotion } from "../world-view/playerMotionStore";
import { cellToPixel, cellToPixelCenter, PIXELS_PER_CELL } from "./shop-scale";

/**
 * The hose's fixed length. Long enough to park the drum and work a real
 * patch of floor around it before it gets towed along.
 */
const HOSE_LENGTH = PIXELS_PER_CELL * 6;
/**
 * The drum starts moving when the hose is nearly straight — a touch
 * before the geometric limit so the arc never has to go degenerate.
 */
const TAUT_FRACTION = 0.95;
/** How hard the taut hose reels the drum in, per second. */
const TOW_RATE = 10;

/** The suction wand, from the hand out toward where the player faces. */
const NOZZLE_LENGTH = PIXELS_PER_CELL * 0.9;

/**
 * Solve the half-angle θ ∈ (0, π) of the circular arc with arc length
 * `length` spanning a chord `chord`: sin θ / θ = chord / length. The
 * ratio is monotonic decreasing, so a bisection nails it fast.
 */
function arcHalfAngle(chord: number, length: number): number {
  const ratio = Math.min(1, Math.max(0, chord / length));
  let low = 1e-4;
  let high = Math.PI - 1e-4;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (Math.sin(mid) / mid > ratio) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * The shop vac: a squat canister drum on casters, dragged around by its
 * hose. The hose has no physics at all — every frame it is simply *the*
 * circular arc of fixed length HOSE_LENGTH from the drum's port to the
 * player's hand: close to the drum it lies in a wide loop, and as the
 * player walks off it pays out into a straightening curve. Only when
 * it comes taut does the drum get towed along. Deterministic geometry,
 * so it holds perfectly still while you stand still — a stiff
 * corrugated hose, not a rope. Parked, the hose lies coiled on the
 * lid. All render-layer: nothing here touches GameState.
 */
export const ShopVacSprite: React.FC = () => {
  const gameState = useGameState();
  const stateRef = useRef<GameState>(gameState);
  stateRef.current = gameState;
  const graphicsRef = useRef<Graphics>(null);
  const drumPos = useRef<[number, number] | null>(null);

  useTick((ticker: Ticker) => {
    const g = graphicsRef.current;
    const vac = stateRef.current.shopVac;
    if (!g) return;
    g.clear();
    if (!vac) return;

    const carried = vac.position === null;
    const dt = Math.min(ticker.deltaMS, 100) / 1000;
    const hand: [number, number] = [
      cellToPixel(playerMotion.pos[0]),
      cellToPixel(playerMotion.pos[1]),
    ];

    let x: number;
    let y: number;
    if (carried) {
      // The drum sits still until the hose comes taut, then gets
      // reeled along the pull direction just enough to keep up.
      const prev = drumPos.current ?? [hand[0] - PIXELS_PER_CELL, hand[1]];
      const dx = hand[0] - prev[0];
      const dy = hand[1] - prev[1];
      const distance = Math.hypot(dx, dy);
      const tautLength = HOSE_LENGTH * TAUT_FRACTION;
      if (distance > tautLength) {
        const pull = (distance - tautLength) * Math.min(1, dt * TOW_RATE);
        x = prev[0] + (dx / distance) * pull;
        y = prev[1] + (dy / distance) * pull;
      } else {
        [x, y] = prev;
      }
      drumPos.current = [x, y];
    } else {
      drumPos.current = null;
      [x, y] = cellToPixelCenter(vac.position!);
    }

    const radius = PIXELS_PER_CELL * 0.56;
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

    if (!carried) {
      // Hose coiled on the lid
      g.circle(x, y, radius * 0.8);
      g.stroke({ width: 4, color: 0x4a5866 });
      g.circle(x, y, radius * 0.55);
      g.stroke({ width: 4, color: 0x4a5866 });
      return;
    }

    // ---- The hose: one fixed-length circular arc, port to hand ----
    const port: [number, number] = [x, y - radius * 0.4];
    const chordX = hand[0] - port[0];
    const chordY = hand[1] - port[1];
    const chord = Math.hypot(chordX, chordY);
    const drawHose = (draw: () => void) => {
      draw();
      g.stroke({ width: 6, color: 0x262e38 });
      draw();
      g.stroke({ width: 3.5, color: 0x4a5866 });
    };
    const theta = arcHalfAngle(Math.max(chord, 1e-3), HOSE_LENGTH);
    if (theta < 0.05 || chord < 1e-3) {
      // Effectively straight (or endpoints coincide): a line is exact
      drawHose(() => {
        g.moveTo(port[0], port[1]);
        g.lineTo(hand[0], hand[1]);
      });
    } else {
      const arcRadius = HOSE_LENGTH / (2 * theta);
      // Center: off the chord midpoint, perpendicular, opposite the bulge
      const midX = (port[0] + hand[0]) / 2;
      const midY = (port[1] + hand[1]) / 2;
      const perpX = -chordY / Math.max(chord, 1e-3);
      const perpY = chordX / Math.max(chord, 1e-3);
      const centerX = midX + perpX * arcRadius * Math.cos(theta);
      const centerY = midY + perpY * arcRadius * Math.cos(theta);
      const startAngle = Math.atan2(port[1] - centerY, port[0] - centerX);
      const endAngle = Math.atan2(hand[1] - centerY, hand[0] - centerX);
      drawHose(() => {
        g.moveTo(port[0], port[1]);
        g.arc(centerX, centerY, arcRadius, startAngle, endAngle);
      });
    }

    // ---- Nozzle wand while the hold is on ----
    const gs = stateRef.current;
    const sucking =
      gs.player.operating === true &&
      gs.player.away === null &&
      canisterRoom(vac) > 0;
    if (sucking) {
      const tipX = hand[0] + Math.cos(playerMotion.heading) * NOZZLE_LENGTH;
      const tipY = hand[1] + Math.sin(playerMotion.heading) * NOZZLE_LENGTH;
      g.moveTo(hand[0], hand[1]);
      g.lineTo(tipX, tipY);
      g.stroke({ width: 5, color: 0x262e38 });
      g.moveTo(hand[0], hand[1]);
      g.lineTo(tipX, tipY);
      g.stroke({ width: 2.5, color: 0x6b7a8a });
    }
  });

  if (!gameState.shopVac) {
    return null;
  }
  // All real drawing happens per-frame in useTick; the draw prop is just
  // the required initial paint.
  return <pixiGraphics ref={graphicsRef} draw={(g) => g.clear()} />;
};
