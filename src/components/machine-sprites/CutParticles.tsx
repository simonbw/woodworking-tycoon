import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { Species } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { rUniform } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  angle: number;
  spin: number;
}

const MAX_PARTICLES = 90;

/**
 * Wood leaving the cut. Saws throw `dust` — small fast flecks; jointers
 * and planers throw `shavings` — bigger, slower curls that tumble. Both
 * are colored like the species' freshly cut interior, so walnut throws
 * dark chips and maple throws pale ones. While `active` is false the
 * emitter stops spawning but live particles finish their arcs, so the
 * spray winds down naturally when an operation pauses or completes.
 */
export const CutParticles: React.FC<{
  kind: "dust" | "shavings";
  species: Species;
  active: boolean;
  x?: number;
  y?: number;
  /** Spray direction in radians (0 = +x, π/2 = +y). */
  direction: number;
  spread?: number;
}> = ({ kind, species, active, x = 0, y = 0, direction, spread }) => {
  const graphicsRef = useRef<Graphics>(null);
  const particles = useRef<Particle[]>([]);
  const spawnDebt = useRef(0);

  const dust = kind === "dust";
  const rate = dust ? 70 : 22;
  const arc = spread ?? (dust ? 0.7 : 1.1);

  useTick((ticker: Ticker) => {
    const g = graphicsRef.current;
    if (!g) return;
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    const pool = particles.current;

    if (active) {
      spawnDebt.current += rate * dt;
      const base = colorBySpecies[species].primary;
      while (spawnDebt.current >= 1 && pool.length < MAX_PARTICLES) {
        spawnDebt.current -= 1;
        const heading = direction + rUniform(-arc / 2, arc / 2);
        const speed = dust ? rUniform(50, 110) : rUniform(20, 45);
        const maxLife = dust ? rUniform(0.35, 0.7) : rUniform(0.7, 1.3);
        pool.push({
          x: x + rUniform(-1.5, 1.5),
          y: y + rUniform(-1.5, 1.5),
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed,
          life: maxLife,
          maxLife,
          size: dust ? rUniform(1.2, 2.4) : rUniform(3, 5),
          // Freshly cut wood is brighter than the weathered surface
          color: mixColors(base, 0xffffff, rUniform(0.15, 0.45)),
          angle: rUniform(0, Math.PI * 2),
          spin: rUniform(-6, 6),
        });
      }
    } else {
      spawnDebt.current = 0;
    }

    const drag = dust ? 4 : 2.5;
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        pool.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx -= p.vx * drag * dt;
      p.vy -= p.vy * drag * dt;
      p.angle += p.spin * dt;
    }

    g.clear();
    for (const p of pool) {
      const alpha = Math.min(1, (p.life / p.maxLife) * 1.6);
      if (dust) {
        g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        g.fill({ color: p.color, alpha });
      } else {
        // A shaving: a short curl, drawn as an open arc that tumbles
        g.arc(p.x, p.y, p.size, p.angle, p.angle + Math.PI * 1.3);
        g.stroke({ width: 1.4, color: p.color, alpha });
      }
    }
  });

  return <pixiGraphics ref={graphicsRef} draw={noop} />;
};

// The graphics are drawn imperatively each frame in useTick
const noop = () => {};
