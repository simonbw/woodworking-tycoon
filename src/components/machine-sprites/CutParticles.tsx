import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { deriveMachineCutLoad } from "../../game/cut-load";
import { Machine } from "../../game/Machine";
import { Species } from "../../game/Materials";
import { DUST_BAG_CAPTURE } from "../../game/tools/dustBag";
import { mixColors } from "../../utils/colorUtils";
import { rBool, rUniform } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { emitDustStamp } from "../shop-view/dustStampBus";

/**
 * Emission intensity for a machine's cut spray: the fraction of its mess
 * that escapes the dust port, scaled by how much wood the cut is taking
 * off. Mirrors the emission math in tickAction, so what you see flying
 * matches what lands on the floor.
 */
export function cutSprayIntensity(machine: Machine): number {
  const escaped = machine.state.tools.includes("dustBag")
    ? 1 - DUST_BAG_CAPTURE
    : 1;
  return escaped * deriveMachineCutLoad(machine);
}

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
  /** Settling chips bake into the DustLayer floor when they come to rest. */
  settles: boolean;
}

const MAX_PARTICLES = 90;

/**
 * Of the fine dust flecks, how many visibly stay on the floor. The rest
 * read as "too fine to see" and fade — full stamping of the saws' dense
 * spray would grime the floor much faster than the shavings' sparse one.
 */
const DUST_SETTLE_FRACTION = 0.3;

/**
 * Wood leaving the cut. Saws throw `dust` — small fast flecks; jointers
 * and planers throw `shavings` — bigger, slower curls that tumble. Both
 * are colored like the species' freshly cut interior, so walnut throws
 * dark chips and maple throws pale ones. While `active` is false the
 * emitter stops spawning but live particles finish their arcs, so the
 * spray winds down naturally when an operation pauses or completes.
 *
 * Chips don't just vanish: settling particles come to rest and hand
 * themselves off to the DustLayer (via the dust stamp bus), which bakes
 * them into the floor right where they stopped.
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
  /**
   * Scales the spray density (1 = full mess). A mounted dust bag passes
   * its escape fraction here so the capture is visible at the blade.
   */
  intensity?: number;
}> = ({
  kind,
  species,
  active,
  x = 0,
  y = 0,
  direction,
  spread,
  intensity = 1,
}) => {
  const graphicsRef = useRef<Graphics>(null);
  const particles = useRef<Particle[]>([]);
  const spawnDebt = useRef(0);

  const dust = kind === "dust";
  const rate = (dust ? 70 : 22) * intensity;
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
        // Fast enough to clear the machine sprite before drag wins —
        // settled chips should land on visible floor, not under the tool
        const speed = dust ? rUniform(140, 320) : rUniform(90, 260);
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
          settles: dust ? rBool(DUST_SETTLE_FRACTION) : true,
        });
      }
    } else {
      spawnDebt.current = 0;
    }

    const drag = dust ? 5 : 2.5;
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.settles) {
          // At rest: bake into the floor exactly where the chip stopped.
          // Positions are machine-local (this container is rotated with
          // the machine), so convert to stage space for the DustLayer.
          const resting = g.toGlobal({ x: p.x, y: p.y });
          emitDustStamp({
            x: resting.x,
            y: resting.y,
            color: p.color,
            size: p.size,
            kind,
            angle: p.angle,
          });
        }
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
      // Settling chips hold their color to the end — the baked stamp
      // continues them seamlessly. Fading is for dust too fine to keep.
      const alpha = p.settles ? 0.95 : Math.min(1, (p.life / p.maxLife) * 1.6);
      if (dust) {
        g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        g.fill({ color: p.color, alpha });
      } else {
        // A shaving: a short curl, drawn as an open arc that tumbles.
        // moveTo first, or the path connects from the previous curl.
        g.moveTo(
          p.x + p.size * Math.cos(p.angle),
          p.y + p.size * Math.sin(p.angle),
        );
        g.arc(p.x, p.y, p.size, p.angle, p.angle + Math.PI * 1.3);
        g.stroke({ width: 1.4, color: p.color, alpha });
      }
    }
  });

  return <pixiGraphics ref={graphicsRef} draw={noop} />;
};

// The graphics are drawn imperatively each frame in useTick
const noop = () => {};
