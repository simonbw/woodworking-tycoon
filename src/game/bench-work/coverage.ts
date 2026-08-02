/**
 * The coverage mask behind all stroke work in the bench view (see
 * docs/bench-minigames.md): sanding, planing, and the hand saw's kerf.
 *
 * Two layers share one source of stamps. The VISUAL layer is a PIXI
 * RenderTexture the surface component stamps a soft brush into — standard
 * scratch-off rendering, never read back from the GPU. THIS file is the
 * accounting layer: a CPU-side accumulation grid at a few pixels per
 * cell, bumped analytically as the same stamps land. The grid math is a
 * pure function — stamps in, coverage out — so completion is
 * deterministic and unit-testable, and the operation completes when
 * coverage crosses COVERAGE_COMPLETE so the last sliver of edge never
 * holds the board hostage.
 */

/**
 * The fraction of the grid that counts as done. Deliberately short of
 * 1 — pixel-hunting the final corner is friction, not craft.
 */
export const COVERAGE_COMPLETE = 0.98;

/** Grid resolution: cells per inch of workpiece. Coarse on purpose —
 * the mask decides "is it sanded", not "how does it look". */
const CELLS_PER_INCH = 2;

/**
 * A workpiece-sized accumulation grid. Mutable by design: it is
 * ephemeral UI-side state (decision 3 — refresh mid-pass and the pass
 * starts over), owned by one surface component for one attempt.
 */
export interface CoverageGrid {
  readonly cols: number;
  readonly rows: number;
  /** Workpiece width/height in inches, for mapping pointer space. */
  readonly widthIn: number;
  readonly heightIn: number;
  /** Accumulated work per cell, saturating at 1. */
  readonly cells: Float32Array;
  /** Count of cells at or above 1 — kept incrementally. */
  covered: number;
  /** Total clamped accumulation across all cells — the smooth progress
   * readout, where `covered` is the strict completion test. */
  accumulated: number;
}

/** A fresh, untouched grid over a workpiece of the given size (inches). */
export function makeCoverageGrid(
  widthIn: number,
  heightIn: number,
): CoverageGrid {
  const cols = Math.max(1, Math.round(widthIn * CELLS_PER_INCH));
  const rows = Math.max(1, Math.round(heightIn * CELLS_PER_INCH));
  return {
    cols,
    rows,
    widthIn,
    heightIn,
    cells: new Float32Array(cols * rows),
    covered: 0,
    accumulated: 0,
  };
}

/**
 * Land one brush stamp: a disc of the given radius (inches) centered at
 * (x, y) in workpiece inches, adding `amount` of work to every cell it
 * touches, with a soft falloff toward the rim. Returns the grid's new
 * covered fraction so callers can stamp-and-check in one motion.
 */
export function stampBrush(
  grid: CoverageGrid,
  xIn: number,
  yIn: number,
  radiusIn: number,
  amount: number,
): number {
  const cx = xIn * CELLS_PER_INCH;
  const cy = yIn * CELLS_PER_INCH;
  const r = Math.max(radiusIn * CELLS_PER_INCH, 0.75);
  const minCol = Math.max(0, Math.floor(cx - r));
  const maxCol = Math.min(grid.cols - 1, Math.ceil(cx + r));
  const minRow = Math.max(0, Math.floor(cy - r));
  const maxRow = Math.min(grid.rows - 1, Math.ceil(cy + r));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = col + 0.5 - cx;
      const dy = row + 0.5 - cy;
      const distance = Math.hypot(dx, dy);
      if (distance > r) {
        continue;
      }
      // Soft brush: full strength through the core, fading at the rim
      const falloff = Math.min(1, 2 * (1 - distance / r));
      const index = row * grid.cols + col;
      const before = grid.cells[index];
      if (before >= 1) {
        continue;
      }
      const after = Math.min(1, before + amount * falloff);
      grid.cells[index] = after;
      grid.accumulated += after - before;
      if (after >= 1) {
        grid.covered++;
      }
    }
  }
  return coverageFraction(grid);
}

/**
 * A stroke segment: the pointer moved from (x0,y0) to (x1,y1) this frame,
 * with the tool laying down `amount` of work per stamp. Stamps are laid
 * at sub-radius intervals along the segment so a fast drag doesn't skip.
 * Returns the new covered fraction.
 */
export function stampStroke(
  grid: CoverageGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radiusIn: number,
  amount: number,
): number {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const spacing = Math.max(radiusIn / 2, 0.05);
  const steps = Math.max(1, Math.ceil(length / spacing));
  let fraction = coverageFraction(grid);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fraction = stampBrush(
      grid,
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t,
      radiusIn,
      amount,
    );
  }
  return fraction;
}

/** The fraction of cells at full accumulation, 0..1. */
export function coverageFraction(grid: CoverageGrid): number {
  return grid.covered / (grid.cols * grid.rows);
}

/**
 * The smooth progress readout, 0..1: average accumulation across the
 * grid. Moves from the very first stroke, unlike `coverageFraction`,
 * which only counts fully-saturated cells — the completion test stays
 * strict (no credit for a board sanded thin everywhere), but a progress
 * bar that sits at 0 through the first pass reads as broken.
 */
export function coverageProgress(grid: CoverageGrid): number {
  return grid.accumulated / (grid.cols * grid.rows);
}

/** Whether the pass is done — coverage past the completion threshold. */
export function coverageComplete(grid: CoverageGrid): boolean {
  return coverageFraction(grid) >= COVERAGE_COMPLETE;
}

/**
 * How much work one second of active stroking should lay down per stamp,
 * given the tool's coverage rate (in²/s), its brush radius, and how the
 * component throttles stamps. Derivation: a stamp saturates roughly a
 * π·r² disc; laying `coveragePerSecond` square inches per second means
 * filling that disc every (πr²/rate) seconds, spread over the stamps
 * landed in that time.
 */
export function amountPerStamp(
  coveragePerSecond: number,
  radiusIn: number,
  stampsPerSecond: number,
): number {
  const discArea = Math.PI * radiusIn * radiusIn;
  const secondsToFill = discArea / coveragePerSecond;
  return 1 / Math.max(1, secondsToFill * stampsPerSecond);
}

// ---------------------------------------------------------------------------
// The 1-D kerf, for the hand saw: mark the line, then push–pull strokes
// deepen the cut. Progress scales with the stock's cross-section — a
// thick board takes more strokes than a thin one.
// ---------------------------------------------------------------------------

export interface KerfMask {
  /** Cross-section still to cut, in in² (width × thickness). */
  readonly budget: number;
  /** Cut so far, in the same units. Saturates at budget. */
  progress: number;
}

export function makeKerfMask(widthIn: number, thicknessIn: number): KerfMask {
  return { budget: Math.max(widthIn * thicknessIn, 0.01), progress: 0 };
}

/**
 * One push or pull along the marked line: `travelIn` inches of blade
 * travel at `kerfPerSecond` in²/s of cutting, converted through a
 * nominal stroke speed so the feel is "distance moved saws wood". A
 * stroke only counts while it runs along the line — the component
 * projects pointer motion onto the mark before calling this.
 */
export function sawStroke(
  mask: KerfMask,
  travelIn: number,
  kerfPerSecond: number,
): number {
  // A full stroke is about 8" of travel and takes about a second, so
  // travel converts to seconds at that nominal pace.
  const seconds = Math.abs(travelIn) / 8;
  mask.progress = Math.min(
    mask.budget,
    mask.progress + seconds * kerfPerSecond,
  );
  return kerfFraction(mask);
}

export function kerfFraction(mask: KerfMask): number {
  return mask.progress / mask.budget;
}

export function kerfComplete(mask: KerfMask): boolean {
  return kerfFraction(mask) >= 1;
}
