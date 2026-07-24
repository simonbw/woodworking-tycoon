/**
 * The shop's physical scale. One grid cell is one square foot of floor —
 * the grid exists for machine placement and cell-based bookkeeping (dust,
 * piles, targeting); the player's body moves continuously through it (see
 * docs/continuous-movement.md).
 *
 * This is the game-logic side of the scale. Rendering constants
 * (pixels per inch, pixels per cell) live in
 * src/components/shop-view/shop-scale.tsx and derive from these.
 */
export const INCHES_PER_FOOT = 12;

/** Side length of one grid cell, in inches. A cell is one square foot. */
export const INCHES_PER_CELL = 12;

/** Grid cells per foot of real shop. With 1-ft cells this is 1, so feet
 * and cells are interchangeable — kept as a named constant so the
 * conversion sites stay findable if the grid ever changes again. */
export const CELLS_PER_FOOT = INCHES_PER_FOOT / INCHES_PER_CELL;

export function feetToCells(feet: number): number {
  return feet * CELLS_PER_FOOT;
}

export function inchesToCells(inches: number): number {
  return inches / INCHES_PER_CELL;
}
