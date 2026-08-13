import { CartLine } from "./cart";
import { StoreId } from "./lumberStock";
import { MachineState } from "./Machine";
import { MaterialInstance, Pallet } from "./Materials";
import { Direction, Vector } from "./Vectors";

/**
 * How many pieces of stock fit in the arms at once. Tools commit the
 * hands entirely and a machine takes the shoulders; this is the cap on
 * loose materials. Kept low on purpose: moving a big job's worth of wood
 * is meant to take trips.
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
   * pre-carry saves load untouched. See game-actions/machine-actions.ts.
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
  /**
   * Whether the wait key is held right now — deliberately spending time
   * on nothing, watching the clock spin (see time-flow.ts). Physical
   * key state, transient exactly like `operating`.
   */
  waiting?: boolean;
}

/**
 * A trip out through the garage door. Scavenging is a stop-by-stop circuit
 * the player steers from the cab (keep searching, or call it and head
 * home); a shopping trip lasts as long as the store overlay is open and
 * ends when the player heads home. Either way the shop keeps running —
 * hands-free work continues, attended work waits.
 */
export type AwayTrip = ScavengingTrip | ShoppingTrip | HomeTrip;

/**
 * One stop on the scavenging circuit, rolled when the trip starts and
 * revealed when the search there finishes. A found pallet is loaded on
 * the spot — it rides along until the trip ends and lands it in the
 * truck's bed (see headHomeFromScavengingAction).
 */
export type ScavengeStopResult = {
  readonly stopName: string;
  /** What turned up — null is an empty-handed stop. */
  readonly pallet: Pallet | null;
};

/**
 * Where a scavenging trip stands: half an hour driving to the next spot
 * and digging through it, or sitting in the cab weighing whether it's
 * worth another (searching spends the day; deciding is thinking, and
 * thinking is nearly free). There is no third phase for the way back —
 * calling it good enough puts the truck back at the shop that instant.
 */
export type ScavengePhase =
  | { readonly kind: "searching"; readonly doneTick: number }
  | { readonly kind: "deciding" };

export type ScavengingTrip = {
  readonly kind: "scavenging";
  /** When the trip left the shop; seeds the travel log's flavor. */
  readonly startTick: number;
  /**
   * The whole circuit, rolled up front so tests can inject the rng; only
   * the first `stopsSearched` results have actually been seen.
   */
  readonly stops: ReadonlyArray<ScavengeStopResult>;
  readonly stopsSearched: number;
  readonly phase: ScavengePhase;
};

/** Out at a store. No timer — browsing the aisles is what takes the time. */
export type ShoppingTrip = {
  readonly kind: "shopping";
  /** Which store the trip is to. */
  readonly store: StoreId;
  /**
   * What's off the shelves and not paid for yet (see cart.ts). It hangs
   * on the trip rather than on the shop because that's what it is: a
   * cart you're pushing around a store. Driving away is what empties it,
   * whether you checked out or abandoned it at the end of an aisle.
   */
  readonly cart: ReadonlyArray<CartLine>;
  /**
   * Whether a flatbed cart has been taken from the corral by the
   * entrance. Shelves only load a cart you're actually pushing, so the
   * errand of grabbing one is the first stop of a walkable-store trip.
   * The lumberyard's counter service never involves one.
   */
  readonly hasCart: boolean;
  /**
   * The cell the shopper stands in on the store's floor (store-layout.ts
   * coordinates). It lives on the trip rather than on the player for the
   * same reason the cart does: `player.position` keeps meaning "the cell
   * underfoot in the shop", so every cell system back home is untouched,
   * and a reload mid-trip finds you standing in the aisle.
   */
  readonly position: Vector;
  readonly direction: Direction;
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
