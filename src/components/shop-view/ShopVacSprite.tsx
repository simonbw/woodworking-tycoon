import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { canisterFillFraction, canisterRoom } from "../../game/ShopVac";
import { GameState } from "../../game/GameState";
import { mixColors } from "../../utils/colorUtils";
import { rUniform } from "../../utils/randUtils";
import { dominantDustColor } from "./dust-color";
import { useGameState } from "../useGameState";
import { playerMotion } from "./playerMotionStore";
import { cellToPixel, cellToPixelCenter, PIXELS_PER_CELL } from "./shop-scale";

/**
 * The hose's rest length. Longer than the tow slack, so the spare length
 * bows out to the side instead of stretching taut the moment you move.
 */
const HOSE_LENGTH = PIXELS_PER_CELL * 2.6;
/** Segments in the hose chain — few enough to hold a stiff arc. */
const HOSE_POINTS = 11;
/** How far the drum trails before the hose tows it along. */
const TOW_SLACK = PIXELS_PER_CELL * 1.5;
/** How hard the taut hose reels the drum in, per second. */
const TOW_RATE = 10;
/**
 * Bend stiffness: each frame every interior point is pulled this far
 * toward its neighbors' midpoint. This is what makes it read as a stiff
 * corrugated shop-vac hose rather than a rope — it straightens itself
 * and holds wide arcs around corners.
 */
const HOSE_STIFFNESS = 0.35;
/** Velocity kept per frame (verlet damping) — a hose has no momentum to
 * speak of at this scale. */
const HOSE_DAMPING = 0.62;
const CONSTRAINT_PASSES = 5;

/** The suction wand, from the hand out toward where the player faces. */
const NOZZLE_LENGTH = PIXELS_PER_CELL * 0.9;

interface HosePoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Mote {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

const MAX_MOTES = 50;

/**
 * The shop vac: a squat canister drum on casters, dragged around by its
 * hose. The hose is a small verlet chain with strong bend stiffness —
 * it holds the wide arcs a real corrugated hose does, bows out sideways
 * when you circle the drum, and only when it comes taut does it tow the
 * drum along (so the canister swings wide around corners instead of
 * gliding behind you). While the operate key is held a nozzle wand
 * appears and species-colored motes fly *into* it — the cut spray in
 * reverse. Parked, the hose lies coiled on the lid. All render-layer:
 * nothing here touches GameState.
 */
export const ShopVacSprite: React.FC = () => {
  const gameState = useGameState();
  const stateRef = useRef<GameState>(gameState);
  stateRef.current = gameState;
  const graphicsRef = useRef<Graphics>(null);
  const drumPos = useRef<[number, number] | null>(null);
  const hose = useRef<HosePoint[] | null>(null);
  const motes = useRef<Mote[]>([]);

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
      // Tow with slack: the drum sits still until the hose comes taut,
      // then gets reeled along the pull direction.
      const prev = drumPos.current ?? [
        hand[0] - TOW_SLACK,
        hand[1],
      ];
      const dx = hand[0] - prev[0];
      const dy = hand[1] - prev[1];
      const distance = Math.hypot(dx, dy);
      if (distance > TOW_SLACK) {
        const pull = (distance - TOW_SLACK) * Math.min(1, dt * TOW_RATE);
        x = prev[0] + (dx / distance) * pull;
        y = prev[1] + (dy / distance) * pull;
      } else {
        [x, y] = prev;
      }
      drumPos.current = [x, y];
    } else {
      drumPos.current = null;
      hose.current = null;
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

    // ---- The hose: verlet chain from the drum's port to the hand ----
    const port: [number, number] = [x, y - radius * 0.4];
    if (!hose.current) {
      hose.current = Array.from({ length: HOSE_POINTS }, (_, i) => {
        const t = i / (HOSE_POINTS - 1);
        const hx = port[0] + (hand[0] - port[0]) * t;
        const hy = port[1] + (hand[1] - port[1]) * t;
        return { x: hx, y: hy, px: hx, py: hy };
      });
    }
    const chain = hose.current;
    // Integrate the interior points
    for (let i = 1; i < chain.length - 1; i++) {
      const p = chain[i];
      const vx = (p.x - p.px) * HOSE_DAMPING;
      const vy = (p.y - p.py) * HOSE_DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }
    // Pin the ends, then relax lengths and stiffness
    const rest = HOSE_LENGTH / (HOSE_POINTS - 1);
    for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
      chain[0].x = port[0];
      chain[0].y = port[1];
      chain[chain.length - 1].x = hand[0];
      chain[chain.length - 1].y = hand[1];
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i];
        const b = chain[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1e-6;
        const correction = (distance - rest) / distance / 2;
        const ax = i === 0 ? 0 : correction;
        const bx = i + 1 === chain.length - 1 ? 0 : correction;
        a.x += dx * ax;
        a.y += dy * ax;
        b.x -= dx * bx;
        b.y -= dy * bx;
      }
      // Bend stiffness: interior points seek their neighbors' midpoint
      for (let i = 1; i < chain.length - 1; i++) {
        const p = chain[i];
        const midX = (chain[i - 1].x + chain[i + 1].x) / 2;
        const midY = (chain[i - 1].y + chain[i + 1].y) / 2;
        p.x += (midX - p.x) * HOSE_STIFFNESS;
        p.y += (midY - p.y) * HOSE_STIFFNESS;
      }
    }
    const strokeHose = (width: number, color: number) => {
      g.moveTo(chain[0].x, chain[0].y);
      for (let i = 1; i < chain.length; i++) {
        g.lineTo(chain[i].x, chain[i].y);
      }
      g.stroke({ width, color });
    };
    strokeHose(6, 0x262e38);
    strokeHose(3.5, 0x4a5866);

    // ---- Nozzle wand + suction motes while the hold is on ----
    const gs = stateRef.current;
    const sucking =
      gs.player.operating === true &&
      gs.player.away === null &&
      canisterRoom(vac) > 0;
    const tipX = hand[0] + Math.cos(playerMotion.heading) * NOZZLE_LENGTH;
    const tipY = hand[1] + Math.sin(playerMotion.heading) * NOZZLE_LENGTH;
    if (sucking) {
      g.moveTo(hand[0], hand[1]);
      g.lineTo(tipX, tipY);
      g.stroke({ width: 5, color: 0x262e38 });
      g.moveTo(hand[0], hand[1]);
      g.lineTo(tipX, tipY);
      g.stroke({ width: 2.5, color: 0x6b7a8a });

      const color = dominantDustColor(gs);
      if (color !== null && motes.current.length < MAX_MOTES) {
        // Born scattered in the patch ahead of the nozzle, dying at it
        for (let i = 0; i < 3; i++) {
          const spread = rUniform(-1, 1) * PIXELS_PER_CELL;
          const reach = rUniform(0.2, 1.6) * PIXELS_PER_CELL;
          motes.current.push({
            x: tipX + Math.cos(playerMotion.heading) * reach - Math.sin(playerMotion.heading) * spread,
            y: tipY + Math.sin(playerMotion.heading) * reach + Math.cos(playerMotion.heading) * spread,
            life: 0,
            maxLife: rUniform(0.15, 0.3),
            size: rUniform(1.2, 2.4),
            color: mixColors(color, 0xffffff, rUniform(0.1, 0.4)),
          });
        }
      }
    }
    motes.current = motes.current.filter((mote) => {
      mote.life += dt;
      if (mote.life >= mote.maxLife) return false;
      // Ease each mote into the nozzle tip over its short life
      const t = mote.life / mote.maxLife;
      const ease = 1 - (1 - t) * (1 - t);
      const drawX = mote.x + (tipX - mote.x) * ease;
      const drawY = mote.y + (tipY - mote.y) * ease;
      g.rect(
        drawX - mote.size / 2,
        drawY - mote.size / 2,
        mote.size,
        mote.size,
      );
      g.fill({ color: mote.color, alpha: 0.85 * (1 - t * 0.5) });
      return true;
    });
  });

  if (!gameState.shopVac) {
    return null;
  }
  // All real drawing happens per-frame in useTick; the draw prop is just
  // the required initial paint.
  return <pixiGraphics ref={graphicsRef} draw={(g) => g.clear()} />;
};
