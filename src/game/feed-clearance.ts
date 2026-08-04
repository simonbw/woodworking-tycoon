import { formatLength } from "../utils/formatNumber";
import { CellMap } from "./CellMap";
import { Machine } from "./Machine";
import { MaterialInstance } from "./Materials";
import { Vector } from "./Vectors";

/**
 * Room to run long stock through a feed-through machine (see
 * MachineType.feedsThrough). A board has to travel its whole length past
 * the cutter: before the cut it lies entirely on the infeed side, after
 * it entirely on the outfeed side, so each side needs clear run scaled to
 * the stock — the static freeCellsNeeded only guarantee the working
 * apron. Cells are feet, so the numbers below read as feet of runway.
 *
 * The lane is the single column of cells the stock travels along: the
 * machine's operation column, extended out both ends of the footprint.
 * Machines block it; the walls block it; a *bare worktable does not* —
 * stock slides over a table top, which is exactly what an outfeed table
 * is for. (A worktable with a benchtop machine mounted on it blocks like
 * the machine it carries.)
 */

/** Clear run available beyond the footprint, in cells, per side. */
export interface FeedRun {
  readonly infeed: number;
  readonly outfeed: number;
}

export interface FeedShortfall {
  readonly material: MaterialInstance;
  /** Stock length along the direction of travel, in inches. */
  readonly lengthIn: number;
  /** Clear cells needed past the footprint on each side. */
  readonly needed: number;
  /** Clear cells actually there (counted no further than needed). */
  readonly available: FeedRun;
}

/**
 * How far this stock travels through a machine, in inches — its length —
 * or null for stock with no length to speak of (a finished box doesn't
 * get fed through anything).
 */
export function stockTravelLength(material: MaterialInstance): number | null {
  switch (material.type) {
    case "board":
    case "panel":
    case "plywood":
      return material.length;
    default:
      return null;
  }
}

/**
 * Clear cells needed past the footprint on each side to run stock of
 * this length through. The cutter sits mid-bed, so half the bed (rounded
 * in the stock's favor) supports each side; the rest of the stock needs
 * open lane.
 */
export function feedRunNeeded(machine: Machine, lengthIn: number): number {
  const { bedLength } = feedLane(machine);
  // Cells are feet; off-grid stock rounds up — a 30" board still needs
  // its third foot of lane
  const lengthCells = Math.ceil(lengthIn / 12);
  return Math.max(0, lengthCells - Math.ceil(bedLength / 2));
}

/**
 * The feed lane's local geometry: which axis stock travels along, where
 * the lane column sits, and how long the bed is. The infeed is the
 * operation side (the operator pushes stock away from themselves).
 */
function feedLane(machine: Machine): {
  /** 0 for travel along local x, 1 for local y. */
  axis: 0 | 1;
  /** The lane's coordinate on the other axis. */
  cross: number;
  /** Footprint extent along the travel axis, in cells. */
  bedLength: number;
  /** Footprint bound nearest the operator (infeed side). */
  infeedEdge: number;
  /** Footprint bound on the far side (outfeed). */
  outfeedEdge: number;
  /** +1 or -1: which way the infeed side lies from the footprint. */
  infeedSign: 1 | -1;
} {
  const op = machine.type.operationPosition;
  if (op === undefined) {
    throw new Error(
      `Feed-through machine ${machine.type.id} has no operation position`,
    );
  }
  const cells = machine.type.cellsOccupied;
  const bounds = (axis: 0 | 1) => {
    const values = cells.map((cell) => cell[axis]);
    return [Math.min(...values), Math.max(...values)] as const;
  };
  // Stock travels along whichever axis puts the operator outside the
  // footprint — that's the axis the operation cell sticks out on.
  const [minX, maxX] = bounds(0);
  const axis: 0 | 1 = op[0] < minX || op[0] > maxX ? 0 : 1;
  const [min, max] = bounds(axis);
  const infeedSign = op[axis] > max ? 1 : -1;
  return {
    axis,
    cross: op[axis === 0 ? 1 : 0],
    bedLength: max - min + 1,
    infeedEdge: infeedSign === 1 ? max : min,
    outfeedEdge: infeedSign === 1 ? min : max,
    infeedSign,
  };
}

/** The lane cell `steps` cells past the given footprint edge, in shop coords. */
function laneCell(
  machine: Machine,
  lane: ReturnType<typeof feedLane>,
  edge: number,
  sign: 1 | -1,
  steps: number,
): Vector {
  const along = edge + sign * steps;
  const local: Vector =
    lane.axis === 0 ? [along, lane.cross] : [lane.cross, along];
  return machine.localToShop(local);
}

/** Whether stock can pass over this cell: open floor or a bare worktable. */
function lanePassable(cellMap: CellMap, position: Vector): boolean {
  const cell = cellMap.at(position);
  if (cell === undefined) {
    return false; // Outside the shop: a wall
  }
  return cell.machine === undefined || cell.machine.type.worktable === true;
}

/**
 * Clear run past each end of the machine's feed lane, counted outward
 * from the footprint and capped at `cap` — past that the answer can't
 * matter.
 */
export function feedRunAvailable(
  machine: Machine,
  cellMap: CellMap,
  cap: number,
): FeedRun {
  const lane = feedLane(machine);
  const count = (edge: number, sign: 1 | -1): number => {
    let run = 0;
    while (
      run < cap &&
      lanePassable(cellMap, laneCell(machine, lane, edge, sign, run + 1))
    ) {
      run++;
    }
    return run;
  };
  return {
    infeed: count(lane.infeedEdge, lane.infeedSign),
    outfeed: count(lane.outfeedEdge, (lane.infeedSign * -1) as 1 | -1),
  };
}

/**
 * The first of these materials that doesn't have room to travel through
 * the machine, or null when they all clear. Only meaningful on machines
 * with `feedsThrough`; anything else always clears.
 */
export function feedClearanceShortfall(
  machine: Machine,
  materials: ReadonlyArray<MaterialInstance>,
  cellMap: CellMap,
): FeedShortfall | null {
  if (!machine.type.feedsThrough) {
    return null;
  }
  for (const material of materials) {
    const lengthIn = stockTravelLength(material);
    if (lengthIn === null) {
      continue;
    }
    const needed = feedRunNeeded(machine, lengthIn);
    if (needed === 0) {
      continue;
    }
    const available = feedRunAvailable(machine, cellMap, needed);
    if (available.infeed < needed || available.outfeed < needed) {
      return { material, lengthIn, needed, available };
    }
  }
  return null;
}

/**
 * The mentor line for a clearance refusal: which side is short, by how
 * much, and the two ways out (clear the lane, or shorten the stock).
 */
export function describeFeedShortfall(shortfall: FeedShortfall): string {
  const { lengthIn, needed, available } = shortfall;
  const stock = `${formatLength(lengthIn)} stock needs ${needed}' of clear run`;
  const fix = "Clear the lane, or crosscut the stock shorter first.";
  const infeedShort = available.infeed < needed;
  const outfeedShort = available.outfeed < needed;
  if (infeedShort && outfeedShort) {
    return `${stock} on both sides of the machine — there's ${available.infeed}' at the infeed and ${available.outfeed}' past the outfeed. ${fix}`;
  }
  if (infeedShort) {
    return `${stock} at the infeed — there's only ${available.infeed}'. ${fix}`;
  }
  return `${stock} past the outfeed — there's only ${available.outfeed}'. ${fix}`;
}

/** One side's clear run, with the geometry to draw a ruler along it. */
export interface FeedRunRuler {
  /** Clear cells past the footprint on this side, capped at `cap`. */
  run: number;
  /** The footprint's last cell on this side, in shop coords. */
  edgeCell: Vector;
  /** Unit step from the edge cell outward along the lane. */
  direction: Vector;
}

/**
 * The clear run past each end of the feed lane, measured against the
 * shop as it stands — the shop view draws these as dimension lines while
 * the player lines up where to set the machine down. Null for machines
 * stock doesn't travel through.
 */
export function feedRunRulers(
  machine: Machine,
  cellMap: CellMap,
  cap: number,
): { infeed: FeedRunRuler; outfeed: FeedRunRuler } | null {
  if (!machine.type.feedsThrough) {
    return null;
  }
  const lane = feedLane(machine);
  const available = feedRunAvailable(machine, cellMap, cap);
  const side = (edge: number, sign: 1 | -1, run: number): FeedRunRuler => {
    const edgeCell = laneCell(machine, lane, edge, sign, 0);
    const next = laneCell(machine, lane, edge, sign, 1);
    return {
      run,
      edgeCell,
      direction: [next[0] - edgeCell[0], next[1] - edgeCell[1]],
    };
  };
  return {
    infeed: side(lane.infeedEdge, lane.infeedSign, available.infeed),
    outfeed: side(
      lane.outfeedEdge,
      (lane.infeedSign * -1) as 1 | -1,
      available.outfeed,
    ),
  };
}

/**
 * The lane cells a run of this stock would need, split into the ones
 * that are clear and the ones in the way — the shop view draws these
 * when a shortfall is being explained. Empty for stock with no length.
 */
export function feedLaneCells(
  machine: Machine,
  cellMap: CellMap,
  lengthIn: number,
): { clear: Vector[]; blocked: Vector[] } {
  const needed = feedRunNeeded(machine, lengthIn);
  const lane = feedLane(machine);
  const clear: Vector[] = [];
  const blocked: Vector[] = [];
  const walk = (edge: number, sign: 1 | -1) => {
    for (let step = 1; step <= needed; step++) {
      const cell = laneCell(machine, lane, edge, sign, step);
      (lanePassable(cellMap, cell) ? clear : blocked).push(cell);
    }
  };
  walk(lane.infeedEdge, lane.infeedSign);
  walk(lane.outfeedEdge, (lane.infeedSign * -1) as 1 | -1);
  return { clear, blocked };
}
