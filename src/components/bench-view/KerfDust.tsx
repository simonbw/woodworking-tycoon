import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { DustSpecies } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { rBool, rUniform } from "../../utils/randUtils";
import { dustColorBySpecies } from "../shop-view/colorBySpecies";

/**
 * Sawdust at the kerf. Each stroke the saw surface pushes a burst onto
 * the bus — where the blade crossed the line, which way it was moving,
 * how far it traveled — and this emitter turns them into species-colored
 * flecks kicked along the stroke. Hand-saw dust doesn't jet the way a
 * machine's does (see CutParticles for that): it spills, stalls within a
 * couple of inches, and stays. Most flecks settle where they stop,
 * accumulating into the scatter that hugs the line — the pile a real
 * cut is measured by — while a few fines drift briefly and fade.
 *
 * Everything is drawn in the same piece-local pixel frame the saw
 * surface draws its line in, so the dust rides the piece's placement
 * (turn, flip) for free. The settled scatter lives only as long as the
 * surface: the floor's share of the mess is already bookkept through
 * emitBenchDustAction, so nothing is lost when the cut completes and
 * the view moves on.
 */
export interface KerfBurst {
  /** Where the blade crossed the line, piece-local px. */
  x: number;
  y: number;
  /** Unit vector along the line in the stroke's direction. */
  dirX: number;
  dirY: number;
  /** Stroke travel, inches — scales how much dust the stroke throws. */
  travelIn: number;
}

/** Mutable burst queue, owned by the saw surface, drained here per tick. */
export interface KerfDustBus {
  queue: KerfBurst[];
}

interface Fleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  /** Fades out instead of settling — dust too fine to keep. */
  fine: boolean;
}

interface SettledFleck {
  x: number;
  y: number;
  size: number;
  color: number;
}

/** Past this the scatter stops growing; the cut is nearly through anyway. */
const MAX_SETTLED = 400;

export const KerfDust: React.FC<{
  bus: KerfDustBus;
  species: DustSpecies;
  pxPerIn: number;
}> = ({ bus, species, pxPerIn }) => {
  const graphicsRef = useRef<Graphics>(null);
  const airborne = useRef<Fleck[]>([]);
  const settled = useRef<SettledFleck[]>([]);

  useTick((ticker: Ticker) => {
    const g = graphicsRef.current;
    if (!g) return;
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    const pool = airborne.current;
    const pile = settled.current;

    for (const burst of bus.queue.splice(0)) {
      const base = dustColorBySpecies[species].primary;
      const count = Math.min(8, 1 + Math.round(burst.travelIn * 4));
      for (let i = 0; i < count; i++) {
        const fine = rBool(0.25);
        // Spill speed in inches/s: kicked along the stroke, with a
        // sideways scatter that widens the trail past the kerf itself.
        const along = rUniform(2, 9) * (fine ? 0.5 : 1);
        const across = rUniform(-2.5, 2.5);
        const maxLife = fine ? rUniform(0.5, 1.1) : rUniform(0.2, 0.55);
        pool.push({
          x: burst.x + rUniform(-2, 2),
          y: burst.y + rUniform(-2, 2),
          vx: (burst.dirX * along - burst.dirY * across) * pxPerIn,
          vy: (burst.dirY * along + burst.dirX * across) * pxPerIn,
          life: maxLife,
          maxLife,
          size: Math.max(1.5, 0.1 * pxPerIn) * rUniform(0.7, 1.3),
          // Freshly cut wood is a touch brighter than the weathered
          // surface — a touch only, so walnut dust still reads dark
          color: mixColors(base, 0xffffff, rUniform(0.05, 0.25)),
          fine,
        });
      }
    }

    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (!p.fine && pile.length < MAX_SETTLED) {
          pile.push({ x: p.x, y: p.y, size: p.size, color: p.color });
        }
        pool.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Heavy drag: kerf spill stalls within a hand's width
      p.vx -= p.vx * 7 * dt;
      p.vy -= p.vy * 7 * dt;
      if (p.fine) {
        p.vx += rUniform(-1, 1) * 90 * dt;
        p.vy += rUniform(-1, 1) * 90 * dt;
      }
    }

    g.clear();
    for (const p of pile) {
      g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      g.fill({ color: p.color, alpha: 0.9 });
    }
    for (const p of pool) {
      const alpha = p.fine ? Math.min(1, (p.life / p.maxLife) * 1.6) : 0.95;
      g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      g.fill({ color: p.color, alpha });
    }
  });

  return <pixiGraphics ref={graphicsRef} draw={noop} />;
};

// The graphics are drawn imperatively each frame in useTick
const noop = () => {};
