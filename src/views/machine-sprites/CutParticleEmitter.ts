import { deriveMachineCutLoad } from "../../game/cut-load";
import { Machine } from "../../game/Machine";
import { DustSpecies } from "../../game/Materials";
import { DUST_BAG_CAPTURE } from "../../game/tools/dustBag";
import { mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
import { rBool, rUniform } from "../../utils/randUtils";
import { dustColorBySpecies } from "../../components/shop-view/colorBySpecies";
import { emitDustStamp } from "../../components/shop-view/dustStampBus";
import { EffectsFrame } from "./machine-art";

/**
 * Wood leaving the cut — the old `CutParticles` component as an
 * imperative emitter. The particle model, spawn rates, and drawing are
 * ported line for line; what changed is only the plumbing: instead of a
 * per-emitter graphics attach()ed to ShopView's cut-spray RenderLayer,
 * every emitter on a machine draws into the machine view's one effects
 * graphics, which lives on the "effects" layer above all the machines
 * (same stacking, no filter to escape yet — the targeting outline is
 * phase 4).
 *
 * Settling chips still hand themselves off through the shared
 * `dustStampBus`, in world pixels (the engine's layers share the camera,
 * so world pixels are the stage coordinates the old bus carried). The
 * dust-floor view port subscribes there when it lands.
 *
 * While `active` is false the emitter stops spawning but live particles
 * finish their arcs, so the spray winds down naturally when an operation
 * pauses or completes.
 */

/**
 * Emission intensity for a machine's cut spray: the fraction of its mess
 * that escapes the dust port, scaled by how much wood the cut is taking
 * off. Mirrors the emission math in the machine minute pass, so what you
 * see flying matches what lands on the floor.
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
  /** How fast this particle sheds speed. */
  drag: number;
  /** Airborne wander (px/s² of random acceleration), fines only. */
  drift: number;
  /** Settling chips bake into the dust floor when they come to rest. */
  settles: boolean;
}

const MAX_PARTICLES = 220;

/**
 * Of the coarse dust flecks, how many visibly stay on the floor. The rest
 * read as "too fine to see" and fade.
 */
const DUST_SETTLE_FRACTION = 0.3;

export interface CutParticleEmitterOptions {
  kind: "dust" | "shavings";
  x?: number;
  y?: number;
  /** Spray direction in radians (0 = +x, π/2 = +y). Ignored by `ambient`. */
  direction: number;
  spread?: number;
  /** Extra multiplier on spawn rate, for balancing multiple emitters. */
  density?: number;
  /** Ambient mode: slow omnidirectional fine dust hanging at the blade. */
  ambient?: boolean;
}

export class CutParticleEmitter {
  private particles: Particle[] = [];
  private spawnDebt = 0;

  constructor(private options: CutParticleEmitterOptions) {}

  get isEmpty(): boolean {
    return this.particles.length === 0;
  }

  /** Point the spray somewhere else (the miter saw's tilted rooster tail). */
  setDirection(direction: number): void {
    this.options.direction = direction;
  }

  update(
    rawDt: number,
    active: boolean,
    intensity: number,
    species: DustSpecies,
    fx: EffectsFrame,
  ): void {
    const dt = Math.min(rawDt, 0.05);
    const {
      kind,
      x = 0,
      y = 0,
      direction,
      spread,
      density = 1,
      ambient = false,
    } = this.options;
    const pool = this.particles;

    const dust = kind === "dust";
    const rate = (ambient ? 55 : dust ? 140 : 45) * intensity * density;
    const arc = ambient ? Math.PI * 2 : (spread ?? (dust ? 0.8 : 1.4));
    const spawnRadius = ambient ? 5 : 1.5;

    if (active) {
      this.spawnDebt += rate * dt;
      const base = dustColorBySpecies[species].primary;
      while (this.spawnDebt >= 1 && pool.length < MAX_PARTICLES) {
        this.spawnDebt -= 1;
        const heading = direction + rUniform(-arc / 2, arc / 2);
        // Roughly half of a shavings spray is curls; the cutterhead makes
        // plenty of plain dust alongside them.
        const curl = !dust && !ambient && rBool(0.5);
        // Where this fleck sits on the heavy-chip → fine-dust spectrum.
        const fineness = curl ? 0 : ambient ? rUniform(0.6, 1) : rUniform(0, 1);
        // Heavy chips launch hard and clear the machine sprite before
        // drag wins; fines leave the cut slower and stall sooner.
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
          // Freshly cut wood is a touch brighter than the weathered surface
          color: mixColors(base, 0xffffff, rUniform(0.05, 0.25)),
          angle: rUniform(0, Math.PI * 2),
          spin: rUniform(-6, 6),
          curl,
          drag: curl ? rUniform(2, 3) : lerp(3.5, 8, fineness),
          drift: fineness * 260,
          settles: curl ? true : rBool(DUST_SETTLE_FRACTION * (1 - fineness)),
        });
      }
    } else {
      this.spawnDebt = 0;
    }

    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.settles) {
          // At rest: bake into the floor exactly where the chip stopped.
          // Positions are machine-local; convert to world pixels for the
          // dust floor.
          const [wx, wy] = fx.toWorld(p.x, p.y);
          emitDustStamp({
            x: wx,
            y: wy,
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

    const g = fx.graphics;
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
  }
}
