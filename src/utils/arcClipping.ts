/**
 * Clipping an arc to a rectangle, in angles rather than pixels.
 *
 * PIXI's Graphics has no clip path, and drawing a circle "inside" a shape by
 * masking costs an extra display object per sprite. When the shape is an
 * axis-aligned rectangle — a board's end-grain face, say — the honest answer
 * is cheaper: work out which stretches of the sweep are inside the rectangle
 * and only draw those.
 */

export interface ClipRect {
  /** Left edge, in the same space as the circle's center. */
  x: number;
  /** Top edge. */
  y: number;
  width: number;
  height: number;
}

const TAU = Math.PI * 2;
/** Angular slop when testing a span's midpoint, so tangents don't flicker. */
const EPSILON = 1e-9;

/**
 * The stretches of the arc `[start, end]` on the circle at (cx, cy) that fall
 * inside `rect`, as `[from, to]` angle pairs in the arc's own direction.
 * Returns `[]` when the arc never enters the rectangle, and `[[start, end]]`
 * when it never leaves. `end` must be at or after `start`.
 */
export function clipArcToRect(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  rect: ClipRect,
): [number, number][] {
  if (!(radius > 0) || end <= start) return [];

  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // Every angle at which the circle crosses one of the four edge *lines*.
  // Crossings outside the edge's extent are harmless: they only split a span
  // that the midpoint test then classifies as a whole.
  const crossings: number[] = [];
  for (const x of [left, right]) {
    const cos = (x - cx) / radius;
    if (cos >= -1 && cos <= 1) {
      const a = Math.acos(cos);
      crossings.push(a, -a);
    }
  }
  for (const y of [top, bottom]) {
    const sin = (y - cy) / radius;
    if (sin >= -1 && sin <= 1) {
      const a = Math.asin(sin);
      crossings.push(a, Math.PI - a);
    }
  }

  // Lift each crossing into every turn the sweep actually covers.
  const cuts = [start, end];
  for (const crossing of crossings) {
    const base = crossing - TAU * Math.floor((crossing - start) / TAU);
    for (let a = base; a < end; a += TAU) {
      if (a > start) cuts.push(a);
    }
  }
  cuts.sort((a, b) => a - b);

  const spans: [number, number][] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i];
    const to = cuts[i + 1];
    if (to - from <= EPSILON) continue;
    const mid = (from + to) / 2;
    const x = cx + radius * Math.cos(mid);
    const y = cy + radius * Math.sin(mid);
    if (x < left || x > right || y < top || y > bottom) continue;
    const previous = spans[spans.length - 1];
    if (previous && from - previous[1] <= EPSILON) previous[1] = to;
    else spans.push([from, to]);
  }
  return spans;
}
