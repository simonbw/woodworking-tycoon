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
 * The deterministic seat for a piece nobody has placed yet: a staged
 * pallet lands squarely centered (it covers the bench, overhanging
 * symmetrically when it outsizes the top); anything else scatters a
 * little askew across the front half of the bench, seeded by the
 * piece's id so it lands in the same spot on every render, every tick,
 * and both views — a piece never jumps when the bench is opened.
 */
export function defaultBenchPlacement(
  type: MachineType,
  material: MaterialInstance,
): BenchPlacement {
  const { widthIn, heightIn } = benchTopSizeIn(type);
  if (material.type === "pallet") {
    return { xIn: widthIn / 2, yIn: heightIn / 2, angleDeg: 0, flipped: false };
  }
  const rng = seededRandom(`bench-seat-${material.id}`);
  return {
    xIn: widthIn * (0.22 + rng() * 0.56),
    yIn: heightIn * (0.5 + rng() * 0.4),
    // Lying across the bench, a few degrees off true
    angleDeg: 90 + Math.round((rng() * 2 - 1) * 7),
    flipped: false,
  };
}

/**
 * A point on the pallet, carried through the pallet's own placement to
 * bench inches: pallet-local coordinates measure from the pallet's
 * top-left corner in its unflipped, unturned frame; the placement flips
 * (mirror across the vertical centerline), turns, and seats it.
 */
export function palletPointOnBench(
  placement: BenchPlacement,
  localXIn: number,
  localYIn: number,
): { xIn: number; yIn: number } {
  const dx = (localXIn - PALLET_WIDTH_IN / 2) * (placement.flipped ? -1 : 1);
  const dy = localYIn - PALLET_HEIGHT_IN / 2;
  const rad = (placement.angleDeg * Math.PI) / 180;
  return {
    xIn: placement.xIn + dx * Math.cos(rad) - dy * Math.sin(rad),
    yIn: placement.yIn + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** The inverse: a bench point in the pallet's local frame, for hit
 * tests against nails and edges. */
export function benchPointOnPallet(
  placement: BenchPlacement,
  xIn: number,
  yIn: number,
): { xIn: number; yIn: number } {
  const rad = (-placement.angleDeg * Math.PI) / 180;
  const dx = xIn - placement.xIn;
  const dy = yIn - placement.yIn;
  const localDx =
    (dx * Math.cos(rad) - dy * Math.sin(rad)) * (placement.flipped ? -1 : 1);
  const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    xIn: localDx + PALLET_WIDTH_IN / 2,
    yIn: localDy + PALLET_HEIGHT_IN / 2,
  };
}

/**
 * Where a board freed from the pallet lies: its berth, carried through
 * the pallet's placement — turned with the pallet, mirrored when it's
 * flipped, showing the face the pallet was showing.
 */
export function berthPlacementOnBench(
  placement: BenchPlacement,
  berth: { xIn: number; yIn: number; angleDeg: number },
): BenchPlacement {
  const at = palletPointOnBench(placement, berth.xIn, berth.yIn);
  return {
    xIn: at.xIn,
    yIn: at.yIn,
    angleDeg:
      placement.angleDeg +
      (placement.flipped ? -berth.angleDeg : berth.angleDeg),
    flipped: placement.flipped,
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
