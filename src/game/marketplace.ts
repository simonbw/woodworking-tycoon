import { AcceptedJob, MarketListing } from "./GameState";
import { MaterialInstance } from "./Materials";
import { getMaterialFullName, isFinishedProduct } from "./material-helpers";
import { getSellValue } from "./material-values";
import { TICKS_PER_CALENDAR_DAY, TICKS_PER_DAY } from "./time";

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

/**
 * A fairly-priced listing (r ≤ 1) never waits longer than this to sell.
 * Two calendar days: most of those ticks pass in overnight batches, so
 * in play it reads as "up by the second morning at the latest".
 */
export const LISTING_PITY_TICKS = 2 * TICKS_PER_CALENDAR_DAY;

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
/** Full recovery from zero takes about a calendar day and a half. */
export const DEMAND_RECOVERY_PER_TICK = 1 / (1.5 * TICKS_PER_CALENDAR_DAY);

export function demandFactor(demand: number): number {
  return 0.25 + 0.75 * demand;
}

/**
 * What SawdustList will take: finished pieces, plus the odd secondhand
 * tool. Raw stock never goes up — a stack of offcuts is something to
 * build with or throw in the garbage can, and pricing it by the board
 * foot would make scavenging an income stream instead of a supply run.
 * Jobs are the channel that still asks for boards, and those are
 * somebody else's order, not a shelf you put out.
 */
export function isListable(material: MaterialInstance): boolean {
  return isFinishedProduct(material) || material.type === "tool";
}

/**
 * The saturation bucket a material sells into. Product types are distinct
 * markets — cutting boards don't flood the shelf market — so the type is
 * the bucket.
 */
export function demandCategory(material: MaterialInstance): string {
  return material.type;
}

/** Current demand for a category — a missing meter means full demand. */
export function categoryDemandFor(
  categoryDemand: Readonly<Record<string, number>>,
  category: string,
): number {
  return categoryDemand[category] ?? 1;
}

/**
 * What makes two pieces the same offer. Stock only stacks into one listing
 * when a buyer would have no reason to prefer one piece over the other:
 * same name and state (the established grouping identity — see
 * `getMaterialFullName`) *and* the same fair value, since that is what the
 * whole sale model is expressed against.
 */
export function listingGroupKey(material: MaterialInstance): string {
  return `${getMaterialFullName(material)} @ ${getSellValue(material)}`;
}

/**
 * The piece that speaks for the stack. Every piece in a listing shares a
 * group key, so any of them prices and names the whole offer.
 */
export function listingItem(listing: MarketListing): MaterialInstance {
  return listing.materials[0];
}

/** How many pieces are still on offer. */
export function listingCount(listing: MarketListing): number {
  return listing.materials.length;
}

/**
 * The per-tick chance that one piece sells, all three factors combined.
 * Rolled per piece, not per listing: five identical shelves find buyers
 * about five times as fast as one, and each sale dips the category's
 * demand meter under the next roll.
 */
export function listingSaleChance(
  material: MaterialInstance,
  askingPrice: number,
  reputation: number,
  categoryDemand: Readonly<Record<string, number>>,
): number {
  const fairValue = getSellValue(material);
  if (fairValue <= 0) {
    return 0;
  }
  const r = askingPrice / fairValue;
  const demand = categoryDemandFor(categoryDemand, demandCategory(material));
  return BASE_SALE_RATE * priceFactor(r, reputation) * demandFactor(demand);
}

/**
 * Whether the pity timer fires: fairly priced, waited long enough. It
 * applies to the offer, so a stack that ages out sells a piece per tick
 * until it's gone.
 */
export function listingPitySale(listing: MarketListing, tick: number): boolean {
  const fairValue = getSellValue(listingItem(listing));
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
  "priced to move" | "should sell soon" | "expect a wait" | "ambitious";

export function listingInterest(
  material: MaterialInstance,
  askingPrice: number,
  reputation: number,
  categoryDemand: Readonly<Record<string, number>>,
): ListingInterest {
  const chance = listingSaleChance(
    material,
    askingPrice,
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

/** Open offers rotate off the board this long after being posted —
 * three mornings, in calendar time. */
export const JOB_OFFER_LIFETIME_TICKS = 3 * TICKS_PER_CALENDAR_DAY;

/**
 * The speed bonus: a tip worth up to this fraction of base pay (plus a
 * matching bonus on reputation), decaying linearly to zero over
 * JOB_TIP_DECAY_TICKS from acceptance. Time pressure that never goes
 * negative — a slow job is merely less lucrative, not a failure.
 */
export const JOB_TIP_FRACTION = 0.4;
export const JOB_TIP_DECAY_TICKS = 3 * TICKS_PER_CALENDAR_DAY;

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
