import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { deriveMachineCutLoad } from "../../game/cut-load";
import { Machine } from "../../game/Machine";
import { Species } from "../../game/Materials";
import { DUST_BAG_CAPTURE } from "../../game/tools/dustBag";
import { mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
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
  /** Drawn as a tumbling curl (planer/jointer shaving) instead of a fleck. */
  curl: boolean;
  /**
   * How fast this particle sheds speed. Individual per particle: heavy
   * chips punch through the air; fine dust stalls almost immediately.
   */
  drag: number;
  /**
   * Airborne wander (px/s² of random acceleration). Fine dust doesn't
   * fall out of the air when it stalls — it hangs and drifts. Zero for
   * chips and curls, which just fly and land.
   */
  drift: number;
  /** Settling chips bake into the DustLayer floor when they come to rest. */
  settles: boolean;
}

const MAX_PARTICLES = 220;

/**
 * Of the coarse dust flecks, how many visibly stay on the floor. The rest
 * read as "too fine to see" and fade — full stamping of the saws' dense
 * spray would grime the floor much faster than the shavings' sparse one.
 */
const DUST_SETTLE_FRACTION = 0.3;

/**
 * Wood leaving the cut. Saws throw `dust` — flecks on a spectrum from
 * heavy chips that fly hard and land, down to fines that stall, hang in
 * the air, and drift for seconds before fading. Jointers and planers
 * throw `shavings` — big tumbling curls with a load of flecks mixed in
 * (a cutterhead makes both). Everything is colored like the species'
 * freshly cut interior, so walnut throws dark chips and maple throws
 * pale ones. While `active` is false the emitter stops spawning but live
 * particles finish their arcs, so the spray winds down naturally when an
 * operation pauses or completes.
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
  /** Spray direction in radians (0 = +x, π/2 = +y). Ignored by `ambient`. */
  direction: number;
  spread?: number;
  /**
   * Scales the spray density (1 = full mess). A mounted dust bag passes
   * its escape fraction here so the capture is visible at the blade.
   */
  intensity?: number;
  /**
   * Extra multiplier on spawn rate, for balancing multiple emitters on
   * one machine (e.g. a heavy chip-port jet next to a light blade haze).
   */
  density?: number;
  /**
   * Ambient mode: slow, omnidirectional fine dust that hangs around the
   * blade instead of jetting out of it. Use as a secondary emitter.
   */
  ambient?: boolean;
}> = ({
  kind,
  species,
  active,
  x = 0,
  y = 0,
  direction,
  spread,
  intensity = 1,
  density = 1,
  ambient = false,
}) => {
  const graphicsRef = useRef<Graphics>(null);
  const particles = useRef<Particle[]>([]);
  const spawnDebt = useRef(0);

  const dust = kind === "dust";
  const rate = (ambient ? 55 : dust ? 140 : 45) * intensity * density;
  const arc = ambient ? Math.PI * 2 : (spread ?? (dust ? 0.8 : 1.4));
  const spawnRadius = ambient ? 5 : 1.5;

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
        // Roughly half of a shavings spray is curls; the cutterhead makes
        // plenty of plain dust alongside them.
        const curl = !dust && !ambient && rBool(0.5);
        // Where this fleck sits on the heavy-chip → fine-dust spectrum.
        // Ambient haze is all fines; jets get the full range.
        const fineness = curl ? 0 : ambient ? rUniform(0.6, 1) : rUniform(0, 1);
        // Heavy chips launch hard and clear the machine sprite before
        // drag wins — settled chips should land on visible floor, not
        // under the tool. Fines leave the cut slower and stall sooner.
        const speed = ambient
          ? rUniform(20, 90)
          : curl
            ? rUniform(110, 320)
            : rUniform(200, 560) * (1 - 0.55 * fineness);
        const maxLife = curl
          ? rUniform(0.7, 1.3)
          : lerp(rUniform(0.4, 0.75), rUniform(1.8, 3.2), fineness);
        pool.push({
          x: x + rUniform(-spawnRadius, spawnRadius),
          y: y + rUniform(-spawnRadius, spawnRadius),
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed,
          life: maxLife,
          maxLife,
          size: curl
            ? rUniform(3, 5)
            : lerp(2.8, 1, fineness) * rUniform(0.8, 1.2),
          // Freshly cut wood is a touch brighter than the weathered
          // surface — a touch only, so walnut dust still reads dark
          color: mixColors(base, 0xffffff, rUniform(0.05, 0.25)),
          angle: rUniform(0, Math.PI * 2),
          spin: rUniform(-6, 6),
          curl,
          drag: curl ? rUniform(2, 3) : lerp(3.5, 8, fineness),
          drift: fineness * 260,
          settles: curl
            ? true
            : rBool(DUST_SETTLE_FRACTION * (1 - fineness)),
        });
      }
    } else {
      spawnDebt.current = 0;
    }

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
            kind: p.curl ? "shavings" : "dust",
            angle: p.angle,
          });
        }
        pool.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      // Fines hang and wander once drag has eaten their launch speed
      if (p.drift > 0) {
        p.vx += rUniform(-1, 1) * p.drift * dt;
        p.vy += rUniform(-1, 1) * p.drift * dt;
      }
      p.angle += p.spin * dt;
    }

    g.clear();
    for (const p of pool) {
      // Settling chips hold their color to the end — the baked stamp
      // continues them seamlessly. Fading is for dust too fine to keep.
      const alpha = p.settles ? 0.95 : Math.min(1, (p.life / p.maxLife) * 1.6);
      if (p.curl) {
        // A shaving: a short curl, drawn as an open arc that tumbles.
        // moveTo first, or the path connects from the previous curl.
        g.moveTo(
          p.x + p.size * Math.cos(p.angle),
          p.y + p.size * Math.sin(p.angle),
        );
        g.arc(p.x, p.y, p.size, p.angle, p.angle + Math.PI * 1.3);
        g.stroke({ width: 1.4, color: p.color, alpha });
      } else {
        g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        g.fill({ color: p.color, alpha });
      }
    }
  });

  return <pixiGraphics ref={graphicsRef} draw={noop} />;
};

// The graphics are drawn imperatively each frame in useTick
const noop = () => {};
