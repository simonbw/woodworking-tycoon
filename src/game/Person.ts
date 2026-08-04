import { StoreId } from "./lumberStock";
import { MachineState } from "./Machine";
import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";

/**
 * How many pieces of stock fit in the arms at once. Tools commit the
 * hands entirely and a machine takes the shoulders; this is the cap on
 * loose materials. Kept low on purpose: moving a big job's worth of wood
 * is meant to take trips (see docs/handing-work-over.md).
 */
export const HAND_CAPACITY = 4;

/**
 * Arm room left over what's already carried. Never negative: a save (or
 * an arranged test state) holding more than the cap isn't corrected, it
 * just can't pick anything else up.
 */
export function handSpaceLeft(person: Person): number {
  return Math.max(0, HAND_CAPACITY - person.inventory.length);
}

export interface Person {
  name: string;
  position: Vector;
  direction: Direction;
  inventory: ReadonlyArray<MaterialInstance>;
  /**
   * The machine hoisted over the person's shoulders, mid-rearrangement.
   * Mounted tools, installed upgrades, and shelf stock ride along; its
   * position/rotation are stale until it's set back down. Optional so
   * pre-carry saves load untouched. See docs/carrying-machines.md.
   */
  carriedMachine?: MachineState | null;
  /**
   * Ticks the person is still occupied by their last action — trudging
   * through deep sawdust, finishing a sweep. While positive, each tick
   * decrements it instead, and clean-up presses are ignored.
   */
  busyTicks: number;
  /** Set while the person is out of the shop (e.g. scavenging for pallets). */
  away: AwayTrip | null;
  /**
   * Whether the operate key is held right now — you pushing stock through
   * the machine you're standing at. Attended work only advances while this
   * is true (power-feed operations excepted: the rollers do the pushing).
   *
   * Physical key state, so it's deliberately transient: it isn't in the
   * save schema, and a load starts with hands empty of the key.
   */
  operating?: boolean;
  /**
   * The cell the mouse is steering the broom head toward, already
   * clamped to arm's reach — null (or absent) when the cursor isn't
   * aiming and the swath falls back to the facing direction. Physical
   * pointer state, transient exactly like `operating`.
   */
  sweepAim?: Vector | null;
}

/**
 * A trip out through the garage door. Scavenging runs on a timer and comes
 * home on its own; a shopping trip lasts as long as the store overlay is
 * open and ends when the player heads home. Either way the shop keeps
 * running — hands-free work continues, attended work waits.
 */
export type AwayTrip = ScavengingTrip | ShoppingTrip | HomeTrip;

export type ScavengingTrip = {
  readonly kind: "scavenging";
  readonly returnTick: number;
  /** Determined when the trip starts; delivered as floor piles on return. */
  readonly loot: ReadonlyArray<MaterialInstance>;
};

/** Out at a store. No timer — browsing the aisles is what takes the time. */
export type ShoppingTrip = {
  readonly kind: "shopping";
  /** Which store the trip is to; each is its own overlay. */
  readonly store: StoreId;
};

/**
 * Gone home for the night. Ends via wakeUpAction, which runs the
 * overnight in one batch and puts the player back beside the cab the
 * next morning (see door-actions.ts).
 */
export type HomeTrip = {
  readonly kind: "home";
};

/**
 * Whether the person is free to start work right now: in the shop and not
 * still occupied by their last action (trudging, sweeping). Derived, never
 * stored — tickAction and the cleaning tick passes consult this instead
 * of a persisted flag that would go stale.
 */
export function personCanWork(person: Person): boolean {
  return person.away === null && person.busyTicks === 0;
}
