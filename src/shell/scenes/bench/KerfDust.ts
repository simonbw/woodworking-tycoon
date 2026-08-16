import { Graphics } from "pixi.js";
import { StageFit } from "../../../components/bench-view/stageMath";
import { framePointOnBench } from "../../../game/bench-work/bench-layout";
import { DustSpecies } from "../../../game/Materials";
import { rBool, rUniform } from "../../../utils/randUtils";
import { mixColors } from "../../../utils/colorUtils";
import { dustColorBySpecies } from "../../../components/shop-view/colorBySpecies";
import { PieceSpot } from "./benchStage";

/**
 * Sawdust at the kerf. Each stroke the saw view spills a burst here —
 * where the blade crossed the line, which way it was moving, how far it
 * traveled — and this turns them into species-colored flecks kicked
 * along the stroke. Hand-saw dust doesn't jet the way a machine's does
 * (see CutParticles for that): it spills, stalls within a couple of
 * inches, and stays. Most flecks settle where they stop, accumulating
 * into the scatter that hugs the line — the pile a real cut is measured
 * by — while a few fines drift briefly and fade.
 *
 * Everything is kept in the board's own inches, so the scatter rides
 * the piece's placement (turn, flip) for free. The settled dust lives
 * only as long as the cut: the floor's share of the mess is bookkept
 * through the bench's own dust, so nothing is lost when the board
 * parts and the view moves on.
 */

/** Past this the scatter stops growing; the cut is nearly through. */
const MAX_SETTLED = 400;

export interface KerfBurst {
  /** Where the blade crossed the line, in the board's own inches. */
  xIn: number;
  yIn: number;
  /** Unit vector along the line in the stroke's direction. */
  dirX: number;
  dirY: number;
  /** Stroke travel, inches — scales how much dust the stroke throws. */
  travelIn: number;
  species: DustSpecies;
}

interface Fleck {
  xIn: number;
  yIn: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  sizeIn: number;
  color: number;
  /** Fades out instead of settling — dust too fine to keep. */
  fine: boolean;
}

interface Settled {
  xIn: number;
  yIn: number;
  sizeIn: number;
  color: number;
}

export class KerfDust {
  private airborne: Fleck[] = [];
  private settled: Settled[] = [];

  clear(): void {
    this.airborne = [];
    this.settled = [];
  }

  /** A stroke's worth of dust, thrown from the crossing point. */
  spill(burst: KerfBurst): void {
    const base = dustColorBySpecies[burst.species].primary;
    const count = Math.min(8, 1 + Math.round(burst.travelIn * 4));
    for (let i = 0; i < count; i++) {
      const fine = rBool(0.25);
      // Spill speed in inches/s: kicked along the stroke, with a
      // sideways scatter that widens the trail past the kerf itself.
      const along = rUniform(2, 9) * (fine ? 0.5 : 1);
      const across = rUniform(-2.5, 2.5);
      const maxLife = fine ? rUniform(0.5, 1.1) : rUniform(0.2, 0.55);
      this.airborne.push({
        xIn: burst.xIn + rUniform(-0.1, 0.1),
        yIn: burst.yIn + rUniform(-0.1, 0.1),
        vx: burst.dirX * along - burst.dirY * across,
        vy: burst.dirY * along + burst.dirX * across,
        life: maxLife,
        maxLife,
        sizeIn: 0.1 * rUniform(0.7, 1.3),
        // Freshly cut wood is a touch brighter than the weathered
        // surface — a touch only, so walnut dust still reads dark.
        color: mixColors(base, 0xffffff, rUniform(0.05, 0.25)),
        fine,
      });
    }
  }

  /** Age the flecks. A null spot means no cut is up: everything clears. */
  tick(dt: number, spot: PieceSpot | null): void {
    if (!spot) {
      if (this.airborne.length || this.settled.length) this.clear();
      return;
    }
    const step = Math.min(dt, 0.05);
    for (let i = this.airborne.length - 1; i >= 0; i--) {
      const fleck = this.airborne[i];
      fleck.life -= step;
      if (fleck.life <= 0) {
        if (!fleck.fine && this.settled.length < MAX_SETTLED) {
          this.settled.push({
            xIn: fleck.xIn,
            yIn: fleck.yIn,
            sizeIn: fleck.sizeIn,
            color: fleck.color,
          });
        }
        this.airborne.splice(i, 1);
        continue;
      }
      fleck.xIn += fleck.vx * step;
      fleck.yIn += fleck.vy * step;
      // Heavy drag: kerf spill stalls within a hand's width.
      fleck.vx -= fleck.vx * 7 * step;
      fleck.vy -= fleck.vy * 7 * step;
      if (fleck.fine) {
        fleck.vx += rUniform(-1, 1) * 5 * step;
        fleck.vy += rUniform(-1, 1) * 5 * step;
      }
    }
  }

  /** Draw the scatter where the board lies on the stage. */
  draw(g: Graphics, fit: StageFit, spot: PieceSpot): void {
    const at = (xIn: number, yIn: number) => {
      const point = framePointOnBench(spot.placement, spot.size, xIn, yIn);
      return {
        x: fit.originX + point.xIn * fit.pxPerIn,
        y: fit.originY + point.yIn * fit.pxPerIn,
      };
    };
    for (const fleck of this.settled) {
      const { x, y } = at(fleck.xIn, fleck.yIn);
      const size = fleck.sizeIn * fit.pxPerIn;
      g.rect(x - size / 2, y - size / 2, size, size);
      g.fill({ color: fleck.color, alpha: 0.9 });
    }
    for (const fleck of this.airborne) {
      const { x, y } = at(fleck.xIn, fleck.yIn);
      const size = fleck.sizeIn * fit.pxPerIn;
      const alpha = fleck.fine
        ? Math.min(1, (fleck.life / fleck.maxLife) * 1.6)
        : 0.95;
      g.rect(x - size / 2, y - size / 2, size, size);
      g.fill({ color: fleck.color, alpha });
    }
  }
}
