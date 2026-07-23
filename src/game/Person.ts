import { MachineState } from "./Machine";
import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";

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
  workQueue: ReadonlyArray<WorkItem>;
  canWork: boolean;
  /**
   * Ticks the person is still occupied by their last action — trudging
   * through deep sawdust, finishing a sweep. While positive, each tick
   * decrements it instead of starting queued work.
   */
  busyTicks: number;
  /** Set while the person is out of the shop (e.g. scavenging for pallets). */
  away: AwayTrip | null;
}

/**
 * A trip out through the garage door. Scavenging runs on a timer and comes
 * home on its own; a shopping trip lasts as long as the store overlay is
 * open and ends when the player heads home. Either way the shop keeps
 * running — hands-free work continues, attended work waits.
 */
export type AwayTrip = ScavengingTrip | ShoppingTrip;

export type ScavengingTrip = {
  readonly kind: "scavenging";
  readonly returnTick: number;
  /** Determined when the trip starts; delivered as floor piles on return. */
  readonly loot: ReadonlyArray<MaterialInstance>;
};

/** Out at the store. No timer — browsing the aisles is what takes the time. */
export type ShoppingTrip = {
  readonly kind: "shopping";
};

export type WorkItem = {
  /** Sweep the cell underfoot, pushing its dust the way we're facing. */
  type: "sweep";
};
