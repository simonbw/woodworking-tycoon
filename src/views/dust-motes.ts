import { DustMap, dustKeyToVec, dustTotal, SpeciesAmounts } from "../game/Dust";
import { DustSpecies } from "../game/Materials";
import { Vector } from "../game/Vectors";
import { dustColorBySpecies } from "./colorBySpecies";

/**
 * The bookkeeping behind the airborne dust (DustMotionView): which cells
 * gave dust up since the last frame, what color that dust flies, and how
 * many flecks a given amount is worth. Kept apart from the view so the
 * spawn arithmetic can be checked without a renderer.
 */

/** Particles spawned per unit of dust a cell loses in one tick. */
export const PARTICLES_PER_UNIT = 5;
/** Ceiling on live particles — a hard cap, not a rate. */
export const MAX_PARTICLES = 500;
/** Amounts smaller than this are rounding noise, not a loss. */
const EPSILON = 1e-6;

/**
 * The dominant species in one cell's amounts, or null for a clean cell.
 * The airborne flecks take their color from this.
 */
export function dominantSpeciesColor(
  amounts: SpeciesAmounts | undefined,
): string | null {
  if (!amounts) return null;
  let best: DustSpecies | null = null;
  let bestAmount = 0;
  for (const [species, amount] of Object.entries(amounts)) {
    if ((amount ?? 0) > bestAmount) {
      best = species as DustSpecies;
      bestAmount = amount ?? 0;
    }
  }
  return best ? dustColorBySpecies[best].primary : null;
}

/** One cell handing dust over to the broom head or the nozzle. */
export interface DustLoss {
  /** The cell it left, in shop cell coordinates. */
  readonly cell: Vector;
  /** How much dust the cell gave up. */
  readonly lost: number;
  /** The color the flecks fly, from the species that dominated the cell. */
  readonly color: string;
}

/**
 * Every cell that holds less dust than it did, with the color it had
 * while it still held it. A cell that gained dust (a machine cutting) is
 * not a loss and doesn't throw anything.
 */
export function dustLosses(prev: DustMap, next: DustMap): DustLoss[] {
  const losses: DustLoss[] = [];
  for (const key of Object.keys(prev)) {
    const lost = dustTotal(prev[key]) - dustTotal(next[key]);
    if (lost <= EPSILON) continue;
    const color = dominantSpeciesColor(prev[key]);
    if (color === null) continue;
    losses.push({ cell: dustKeyToVec(key), lost, color });
  }
  return losses;
}

/**
 * Flecks to throw for a cell that lost this much, with `live` particles
 * already in the air. Always at least one, and never past the cap — a
 * count of zero or less means there's no room left this frame.
 */
export function gatherMoteCount(lost: number, live: number): number {
  return Math.min(
    Math.max(1, Math.round(lost * PARTICLES_PER_UNIT)),
    MAX_PARTICLES - live,
  );
}

/**
 * Flecks in one frame of the pour when the pan or the canister empties
 * into the garbage can — a thinner stream than a sweep's burst.
 */
export function pourMoteCount(poured: number, live: number): number {
  return Math.min(
    Math.max(2, Math.round(poured * PARTICLES_PER_UNIT * 0.7)),
    MAX_PARTICLES - live,
  );
}
