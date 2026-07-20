import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";

export interface Person {
  name: string;
  position: Vector;
  direction: Direction;
  inventory: ReadonlyArray<MaterialInstance>;
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

export type AwayTrip = {
  readonly kind: "scavenging";
  readonly returnTick: number;
  /** Determined when the trip starts; delivered as floor piles on return. */
  readonly loot: ReadonlyArray<MaterialInstance>;
};

export type WorkItem =
  | {
      type: "move";
      direction: Direction;
    }
  | {
      /** Sweep the cell underfoot, pushing its dust the way we're facing. */
      type: "sweep";
    };
