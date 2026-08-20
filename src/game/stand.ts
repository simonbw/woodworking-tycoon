import { GameState } from "./GameState";
import { lotSize, isOutdoors } from "./lot";
import { getSellValue } from "./material-values";
import { MaterialInstance } from "./Materials";
import { SolidBox } from "./player-motion";
import { ShopInfo, doorCenterX } from "./ShopInfo";
import { Vector } from "./Vectors";
import { TRUCK_BODY_WIDTH } from "./lot";

/**
 * The for-sale stand: the game's one selling channel.
 *
 * At the end of the driveway, in the grass beside it, sits a little
 * table with a hand-written "FOR SALE" sign. It works as an inventory —
 * the player carries finished pieces down and sets them out, and takes
 * back anything that hasn't sold. Customers stroll the sidewalk line
 * below the lot at various times through the day; one who passes a
 * stocked stand may stop, browse, and buy a piece. There is no pricing
 * step: a piece sells for its fair value (getSellValue), and every sale
 * also earns reputation — the stand is the game's only reputation
 * source, and reputation is what unlocks the lumberyard's channels.
 *
 * This module owns the model: the stand's geometry (derived from
 * ShopInfo the way lot.ts derives the truck's), what it accepts, what a
 * sale pays, and the customers' walking/browsing constants. The per-tick
 * simulation lives in game-actions/stand-actions.ts; the sprites in
 * views/StandView.ts and views/CustomerView.ts.
 *
 * The rates below are deliberately fixed — customer frequency, spend,
 * and taste becoming variable (reputation, how nice the stand looks) is
 * future work, not this version.
 */

/** A passerby on the sidewalk line. Spawned, walked, and retired by
 * standTickPass; drawn by CustomerView as a simple circle. */
export interface Customer {
  readonly id: string;
  /** Continuous x in cell coordinates; y is always the sidewalk line. */
  readonly x: number;
  /** Which way they're strolling: +1 rightward, -1 leftward. */
  readonly walkDirection: 1 | -1;
  /**
   * walking → (maybe) browsing → leaving. A customer browses at most
   * once per pass — "leaving" walks the same line but never stops again.
   */
  readonly state: "walking" | "browsing" | "leaving";
  /** Ticks of browsing left before they decide. Only while browsing. */
  readonly browseTicksLeft: number;
}

// ------------------------------------------------------------------ Geometry

/** The tabletop's footprint in cells: tucked into the grass strip
 * beside the driveway's mouth, at the street end of the lot, its long
 * side facing the pavement. The strip is only as wide as the gap
 * between the lot's edge and the door-width driveway, which is why the
 * table runs tall rather than wide. */
export function standRect(shopInfo: ShopInfo): { min: Vector; max: Vector } {
  const lotBottom = lotSize(shopInfo)[1];
  return {
    min: [0.15, lotBottom - 3.4],
    max: [1.4, lotBottom - 0.9],
  };
}

/** The stand as a solid the walking body collides with. */
export function standSolid(shopInfo: ShopInfo): SolidBox {
  const { min, max } = standRect(shopInfo);
  return { kind: "box", min, max };
}

/** How far from the table a cell still counts as standing at it — an
 * arm's reach, the same spirit as the truck's. */
const STAND_REACH = 1.5;

/** Whether the player's cell is close enough to set out or take back
 * pieces. Indoors never counts. */
export function atStand(shopInfo: ShopInfo, position: Vector): boolean {
  const rect = standRect(shopInfo);
  const cx = position[0] + 0.5;
  const cy = position[1] + 0.5;
  const dx = Math.max(rect.min[0] - cx, 0, cx - rect.max[0]);
  const dy = Math.max(rect.min[1] - cy, 0, cy - rect.max[1]);
  return isOutdoors(shopInfo, position) && Math.hypot(dx, dy) <= STAND_REACH;
}

/** The y of the sidewalk line customers stroll, just past the lot's
 * walkable edge — in front of the stand, crossing the driveway's mouth. */
export function sidewalkY(shopInfo: ShopInfo): number {
  return lotSize(shopInfo)[1] + 1.25;
}

/** Where customers pop into and out of existence, in cells past the
 * lot's sides — far enough that they enter and leave off screen edges
 * at ordinary zoom rather than blinking in. */
export const CUSTOMER_MARGIN = 10;

/** The x-window in front of the stand within which a walking customer
 * notices it and stops to browse. */
export function standFrontage(shopInfo: ShopInfo): {
  left: number;
  right: number;
} {
  const rect = standRect(shopInfo);
  return { left: rect.min[0], right: rect.max[0] };
}

/** Somewhere down the driveway's mouth, for flavor checks that need a
 * single "the stand is here" point (reward flights, tutorial rings). */
export function standCenter(shopInfo: ShopInfo): Vector {
  const rect = standRect(shopInfo);
  return [(rect.min[0] + rect.max[0]) / 2, (rect.min[1] + rect.max[1]) / 2];
}

// ------------------------------------------------------------------ The deal

/**
 * What the stand will take: anything that has a price. Wood has no sale
 * value at all (see material-values.ts), so this comes out as finished
 * pieces plus the odd secondhand tool — a stack of offcuts is something
 * to build with, not something a passerby pays for.
 */
export function isSellable(material: MaterialInstance): boolean {
  return getSellValue(material) > 0;
}

/**
 * The reputation one sale earns, from the piece's value: word of a $9
 * shelf travels a little (~1.5), word of a $50 table travels further
 * (~3.5). Sub-linear so reputation pacing tracks craft progression
 * rather than raw output. Calibrated against the lumberyard's channel
 * gates (12/48 reputation, lumberStock.ts): the yard opens after about
 * eight starter shelves.
 */
export function saleReputationGain(value: number): number {
  if (value <= 0) return 0;
  return roundToHundredth(Math.sqrt(value) / 2);
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reputation accumulates in sale-sized trickles — keep it float-clean. */
export function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

// -------------------------------------------------------------- The customers

/** How fast a customer strolls, in cells per tick — a window-shopping
 * pace, about half the player's working walk. */
export const CUSTOMER_SPEED = 0.35;

/** How long a browsing customer stands at the table before deciding. */
export const CUSTOMER_BROWSE_TICKS = 6;

/** The chance a browsing customer buys something rather than moving on.
 * High on purpose: stopping at a hand-built roadside stand is already
 * most of the decision. */
export const CUSTOMER_BUY_CHANCE = 0.75;

/**
 * Per-tick spawn chance while the stand has something on it — about one
 * customer per game half-hour à la MINUTES_PER_TICK, so a set-out piece
 * sells within an hour or so of shop time. With the stand empty the
 * street mostly empties out too; the strays keep the world from reading
 * as switched off.
 */
export const CUSTOMER_SPAWN_CHANCE_STOCKED = 1 / 30;
export const CUSTOMER_SPAWN_CHANCE_EMPTY = 1 / 240;

/** How many people fit on the sidewalk at once before new ones stop
 * appearing — keeps an untended stand from drawing a crowd. */
export const MAX_CUSTOMERS = 3;

/** The piece a buying customer chooses: uniformly among what's out. */
export function pickPurchase(
  stand: ReadonlyArray<MaterialInstance>,
  rng: () => number,
): MaterialInstance | null {
  if (stand.length === 0) return null;
  return stand[Math.min(stand.length - 1, Math.floor(rng() * stand.length))];
}

/** The walkable-world x-span customers travel, margins included. */
export function customerSpan(shopInfo: ShopInfo): {
  left: number;
  right: number;
} {
  return {
    left: -CUSTOMER_MARGIN,
    right: shopInfo.size[0] + CUSTOMER_MARGIN,
  };
}

/** The driveway's left edge (the parked truck's), which the stand sits
 * clear of. */
export function drivewayLeftEdge(shopInfo: ShopInfo): number {
  return doorCenterX(shopInfo) - TRUCK_BODY_WIDTH / 2;
}
