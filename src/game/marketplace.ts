import { AcceptedJob, MarketListing } from "./GameState";
import { MaterialInstance } from "./Materials";
import { getSellValue } from "./material-values";
import { TICKS_PER_DAY } from "./time";

/**
 * The marketplace sale model (see docs/marketplace-and-jobs.md).
 *
 * Every listing rolls once per tick:
 *
 *   P(sale) = BASE_SALE_RATE × priceFactor(r, reputation) × demandFactor
 *
 * where r = askingPrice / fairValue. getSellValue is the fair-value anchor:
 * no longer "what you get", but what the market thinks an item is worth.
 */

/**
 * At r = 1, baseline reputation, and full demand, a listing takes about half
 * a day to sell (the roll succeeds once per ~300 ticks on average).
 */
export const BASE_SALE_RATE = 1 / 300;

/** A fairly-priced listing (r ≤ 1) never waits longer than this to sell. */
export const LISTING_PITY_TICKS = 2 * TICKS_PER_DAY;

/**
 * Reputation shifts the price curve's center right — pricing power. The
 * shift saturates: a legendary shop can ask ~1.5× fair value as easily as a
 * nobody asks fair value. (Lifetime commission rep is ~30; jobs and reviews
 * add more.)
 */
export function priceCurveCenter(reputation: number): number {
  return 1 + (0.5 * reputation) / (reputation + 25);
}

/**
 * How the asking price scales the sale rate. A logistic-style curve that is
 * exactly 1 at the reputation-shifted center: underpricing sells much
 * faster (saturating at MAX_PRICE_FACTOR), overpricing decays toward zero.
 * At r = 0.7 an item moves within a game-hour or two; at r = 1.5 with low
 * reputation, effectively never.
 */
const MAX_PRICE_FACTOR = 12;
const PRICE_CURVE_STEEPNESS = 8;

export function priceFactor(r: number, reputation: number): number {
  const offset = r - priceCurveCenter(reputation);
  return (
    MAX_PRICE_FACTOR /
    (1 + (MAX_PRICE_FACTOR - 1) * Math.exp(PRICE_CURVE_STEEPNESS * offset))
  );
}

/**
 * Demand saturation. Selling into a flooded category slows sales down but
 * never stops them completely — the floor keeps a saturated market sluggish
 * rather than dead.
 */
export const DEMAND_DIP_PER_SALE = 0.3;
/** Full recovery from zero takes about a day and a half. */
export const DEMAND_RECOVERY_PER_TICK = 1 / (1.5 * TICKS_PER_DAY);

export function demandFactor(demand: number): number {
  return 0.25 + 0.75 * demand;
}

/**
 * The saturation bucket a material sells into. Product types are distinct
 * markets (cutting boards don't flood the shelf market); all raw stock
 * shares one commodity bucket.
 */
export function demandCategory(material: MaterialInstance): string {
  switch (material.type) {
    case "board":
    case "plywood":
    case "panel":
    case "endGrainSlice":
    case "pallet":
      return "lumber";
    default:
      return material.type;
  }
}

/** Current demand for a category — a missing meter means full demand. */
export function categoryDemandFor(
  categoryDemand: Readonly<Record<string, number>>,
  category: string,
): number {
  return categoryDemand[category] ?? 1;
}

/** The per-tick chance that a listing sells, all three factors combined. */
export function listingSaleChance(
  listing: MarketListing,
  reputation: number,
  categoryDemand: Readonly<Record<string, number>>,
): number {
  const fairValue = getSellValue(listing.material);
  if (fairValue <= 0) {
    return 0;
  }
  const r = listing.askingPrice / fairValue;
  const demand = categoryDemandFor(
    categoryDemand,
    demandCategory(listing.material),
  );
  return BASE_SALE_RATE * priceFactor(r, reputation) * demandFactor(demand);
}

/** Whether the pity timer fires: fairly priced, waited long enough. */
export function listingPitySale(listing: MarketListing, tick: number): boolean {
  const fairValue = getSellValue(listing.material);
  return (
    fairValue > 0 &&
    listing.askingPrice <= fairValue &&
    tick - listing.listedAtTick >= LISTING_PITY_TICKS
  );
}

/**
 * The review a buyer leaves: a small reputation trickle scaled by
 * value-for-money. Underpricing builds reputation faster; overpricing earns
 * little but (in v1) never costs any. Capped so dollar-pricing treasures
 * can't farm stars.
 */
export function reviewReputationGain(
  fairValue: number,
  askingPrice: number,
): number {
  if (askingPrice <= 0 || fairValue <= 0) {
    return 0;
  }
  const valueForMoney = fairValue / askingPrice;
  return Math.min(0.3, roundToHundredth(0.05 * valueForMoney * valueForMoney));
}

/**
 * The interest indicator shown at listing time, so pricing is an informed
 * bet rather than a blind gamble. Thresholds are expressed against the
 * expected wait implied by the current sale chance.
 */
export type ListingInterest =
  | "priced to move"
  | "should sell soon"
  | "expect a wait"
  | "ambitious";

export function listingInterest(
  material: MaterialInstance,
  askingPrice: number,
  reputation: number,
  categoryDemand: Readonly<Record<string, number>>,
): ListingInterest {
  const chance = listingSaleChance(
    { id: "", material, askingPrice, listedAtTick: 0 },
    reputation,
    categoryDemand,
  );
  const expectedTicks = chance > 0 ? 1 / chance : Infinity;
  if (expectedTicks <= TICKS_PER_DAY / 4) return "priced to move";
  if (expectedTicks <= TICKS_PER_DAY) return "should sell soon";
  if (expectedTicks <= 3 * TICKS_PER_DAY) return "expect a wait";
  return "ambitious";
}

// ---------------------------------------------------------------------- Jobs

/** Open offers rotate off the board this long after being posted. */
export const JOB_OFFER_LIFETIME_TICKS = 3 * TICKS_PER_DAY;

/**
 * The speed bonus: a tip worth up to this fraction of base pay (plus a
 * matching bonus on reputation), decaying linearly to zero over
 * JOB_TIP_DECAY_TICKS from acceptance. Time pressure that never goes
 * negative — a slow job is merely less lucrative, not a failure.
 */
export const JOB_TIP_FRACTION = 0.4;
export const JOB_TIP_DECAY_TICKS = 3 * TICKS_PER_DAY;

/** Cancelling an accepted job is the only true penalty in the system. */
export const JOB_CANCEL_REPUTATION_LOSS = 1;

/**
 * Reputation milestones that grant additional concurrent job slots. One
 * slot to start, up to five for an established shop.
 */
export const JOB_SLOT_REPUTATION_THRESHOLDS = [8, 16, 26, 40] as const;

export function maxAcceptedJobs(reputation: number): number {
  return (
    1 +
    JOB_SLOT_REPUTATION_THRESHOLDS.filter(
      (threshold) => reputation >= threshold,
    ).length
  );
}

/** The remaining tip fraction (0–1) at a given tick. */
export function jobTipRemaining(job: AcceptedJob, tick: number): number {
  const elapsed = tick - job.acceptedAtTick;
  return Math.max(0, 1 - elapsed / JOB_TIP_DECAY_TICKS);
}

/** What delivering the job right now pays, tip included. */
export function jobPayout(
  job: AcceptedJob,
  tick: number,
): { money: number; reputation: number } {
  const tip = jobTipRemaining(job, tick);
  return {
    money: roundToCents(job.basePay * (1 + JOB_TIP_FRACTION * tip)),
    reputation: roundToHundredth(job.baseReputation * (1 + tip)),
  };
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reputation accumulates in review-sized trickles — keep it float-clean. */
export function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
