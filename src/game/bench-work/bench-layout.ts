import { seededRandom } from "../../utils/randUtils";
import type { Machine, MachineType } from "../Machine";
import { MaterialInstance } from "../Materials";
import { INCHES_PER_CELL } from "../shop-scale";
import { PALLET_HEIGHT_IN, PALLET_WIDTH_IN } from "./pallet-geometry";

/**
 * Where the bench's loose stock lies on the bench top — real, persistent
 * game state (MachineState.benchLayout), not view state: close the sheet,
 * walk away, reload, and every piece is still lying exactly where it was
 * freed or dragged, in the zoomed bench view and the shop view alike.
 * Coordinates are bench-top inches from the footprint's top-left corner
 * in the machine's own (unrotated) frame; pieces may hang past the edges
 * a little, the way real stock overhangs a real bench.
 */
export interface BenchPlacement {
  readonly xIn: number;
  readonly yIn: number;
  /**
   * Accumulated, not normalized — R adds 90° forever, so the view's tween
   * always turns the short way instead of unwinding at the wrap.
   */
  readonly angleDeg: number;
  readonly flipped: boolean;
}

/** The bench top's physical span: the footprint's bounding box in inches. */
export function benchTopSizeIn(type: MachineType): {
  widthIn: number;
  heightIn: number;
} {
  const xs = type.cellsOccupied.map(([x]) => x);
  const ys = type.cellsOccupied.map(([, y]) => y);
  return {
    widthIn: (Math.max(...xs) - Math.min(...xs) + 1) * INCHES_PER_CELL,
    heightIn: (Math.max(...ys) - Math.min(...ys) + 1) * INCHES_PER_CELL,
  };
}

/**
 * A staged pallet's top-left corner in bench inches: centered on the
 * bench top, overhanging symmetrically when the pallet outsizes the
 * bench (negative components). The pallet always lies here — it covers
 * the bench and isn't draggable.
 */
export function palletOriginOnBench(type: MachineType): {
  xIn: number;
  yIn: number;
} {
  const { widthIn, heightIn } = benchTopSizeIn(type);
  return {
    xIn: (widthIn - PALLET_WIDTH_IN) / 2,
    yIn: (heightIn - PALLET_HEIGHT_IN) / 2,
  };
}

/**
 * The deterministic seat for a piece nobody has placed yet: scattered a
 * little askew across the front half of the bench, seeded by the piece's
 * id so it lands in the same spot on every render, every tick, and both
 * views — a piece never jumps when the bench is opened.
 */
export function defaultBenchPlacement(
  type: MachineType,
  material: MaterialInstance,
): BenchPlacement {
  const { widthIn, heightIn } = benchTopSizeIn(type);
  const rng = seededRandom(`bench-seat-${material.id}`);
  return {
    xIn: widthIn * (0.22 + rng() * 0.56),
    yIn: heightIn * (0.5 + rng() * 0.4),
    // Lying across the bench, a few degrees off true
    angleDeg: 90 + Math.round((rng() * 2 - 1) * 7),
    flipped: false,
  };
}

/** Where this piece lies on the bench: its stored placement, or its seed. */
export function benchPlacementFor(
  machine: Machine,
  material: MaterialInstance,
): BenchPlacement {
  return (
    machine.state.benchLayout?.[material.id] ??
    defaultBenchPlacement(machine.type, material)
  );
}
