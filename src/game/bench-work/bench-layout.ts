import { seededRandom } from "../../utils/randUtils";
import type { Machine, MachineType } from "../Machine";
import { MaterialInstance } from "../Materials";
import { INCHES_PER_CELL } from "../shop-scale";
import { productBlueprintFor } from "./blueprint";
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
  /**
   * Flipped up on its long edge (F in the bench view): the piece stands on
   * its edge face, so its footprint narrows to its thickness — how a rail
   * or joist is stood before the deck is nailed across it. Boards only;
   * absent means lying flat (older saves never carry it).
   */
  readonly onEdge?: boolean;
  /** The piece stands on its end — a table leg waiting under a top — so
   * its footprint is its cross-section: width across, thickness deep.
   * Boards only; F cycles flat → on edge → on end → flat. */
  readonly onEnd?: boolean;
}

/**
 * The bench top's physical span in inches: the surface stock can lie on.
 * A worktable is all top — its footprint's bounding box is the answer.
 * The makeshift bench isn't: it's a sheet of plywood balanced on paint
 * buckets that stick out past it, so it states its top (`benchTopIn`)
 * and the footprint covers the buckets too.
 */
export function benchTopSizeIn(type: MachineType): {
  widthIn: number;
  heightIn: number;
} {
  if (type.benchTopIn) {
    return type.benchTopIn;
  }
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
  // A pallet covers the bench; a blueprint-assembled product lands
  // centered too — exactly where its ghost frame stood while it was
  // built, so the finished piece lies right where the last nail went in.
  if (material.type === "pallet" || productBlueprintFor(material.type)) {
    return { xIn: widthIn / 2, yIn: heightIn / 2, angleDeg: 0, flipped: false };
  }
  const rng = seededRandom(`bench-seat-${material.id}`);
  // Scattered across the front half — always well inside the top, so
  // there's nothing for seatInGroup to correct here.
  return {
    xIn: widthIn * (0.22 + rng() * 0.56),
    yIn: heightIn * (0.5 + rng() * 0.4),
    // Lying across the bench, a few degrees off true
    angleDeg: 90 + Math.round((rng() * 2 - 1) * 7),
    flipped: false,
  };
}

/** A framed piece's span in its own local inches — a pallet, a
 * blueprint's product frame — for the shared frame transforms below. */
export interface FrameSizeIn {
  readonly widthIn: number;
  readonly heightIn: number;
}

/**
 * A point in a framed piece's local inches (measured from its top-left
 * corner in its unflipped, unturned frame), carried through the frame's
 * placement to bench inches: the placement flips (mirror across the
 * vertical centerline), turns, and seats it.
 */
export function framePointOnBench(
  placement: BenchPlacement,
  size: FrameSizeIn,
  localXIn: number,
  localYIn: number,
): { xIn: number; yIn: number } {
  const dx = (localXIn - size.widthIn / 2) * (placement.flipped ? -1 : 1);
  const dy = localYIn - size.heightIn / 2;
  const rad = (placement.angleDeg * Math.PI) / 180;
  return {
    xIn: placement.xIn + dx * Math.cos(rad) - dy * Math.sin(rad),
    yIn: placement.yIn + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** The inverse: a bench point in the framed piece's local inches, for
 * hit tests against nails, slots, and edges. */
export function benchPointInFrame(
  placement: BenchPlacement,
  size: FrameSizeIn,
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
    xIn: localDx + size.widthIn / 2,
    yIn: localDy + size.heightIn / 2,
  };
}

/**
 * A slot inside a framed piece (a pallet berth, a blueprint slot),
 * carried through the frame's placement to a bench placement of its own
 * — turned with the frame, mirrored when it's flipped, showing the face
 * the frame is showing.
 */
export function slotPlacementOnBench(
  placement: BenchPlacement,
  size: FrameSizeIn,
  slot: { xIn: number; yIn: number; angleDeg: number },
): BenchPlacement {
  const at = framePointOnBench(placement, size, slot.xIn, slot.yIn);
  return {
    xIn: at.xIn,
    yIn: at.yIn,
    angleDeg:
      placement.angleDeg + (placement.flipped ? -slot.angleDeg : slot.angleDeg),
    flipped: placement.flipped,
  };
}

const PALLET_SIZE: FrameSizeIn = {
  widthIn: PALLET_WIDTH_IN,
  heightIn: PALLET_HEIGHT_IN,
};

/** A point on the pallet, carried through its placement to bench inches. */
export function palletPointOnBench(
  placement: BenchPlacement,
  localXIn: number,
  localYIn: number,
): { xIn: number; yIn: number } {
  return framePointOnBench(placement, PALLET_SIZE, localXIn, localYIn);
}

/** The inverse: a bench point in the pallet's local frame. */
export function benchPointOnPallet(
  placement: BenchPlacement,
  xIn: number,
  yIn: number,
): { xIn: number; yIn: number } {
  return benchPointInFrame(placement, PALLET_SIZE, xIn, yIn);
}

/**
 * Where a board freed from the pallet lies: its berth, carried through
 * the pallet's placement.
 */
export function berthPlacementOnBench(
  placement: BenchPlacement,
  berth: { xIn: number; yIn: number; angleDeg: number },
): BenchPlacement {
  return slotPlacementOnBench(placement, PALLET_SIZE, berth);
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
