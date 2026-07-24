import { MaterialPile } from "./GameState";
import { INCHES_PER_CELL } from "./shop-scale";
import { Vector, vectorEquals } from "./Vectors";

/**
 * How much of a board must reach into a cell before you can grab it from
 * there — a sliver of overhanging tip doesn't count.
 */
const MIN_OVERLAP_CELLS = 0.25;

/**
 * The cells a pile can be grabbed from: every cell its material meaningfully
 * overlaps. Piles render centered on their anchor cell with long stock lying
 * along the vertical axis (see MaterialPilesSprite), so with 1-ft cells an
 * 8' board reaches four cells past its anchor in both directions while
 * anything a foot or under stays a one-cell grab.
 */
export function pileFootprint(pile: MaterialPile): Vector[] {
  const material = pile.material;
  const lengthFeet =
    "length" in material && typeof material.length === "number"
      ? material.length
      : 0;
  const halfCells = (lengthFeet * 12) / INCHES_PER_CELL / 2;
  // A cell |dy| away from the anchor is overlapped by halfCells + 0.5 - dy
  // cells of board; include it while that clears the minimum.
  const reach = Math.max(0, Math.ceil(halfCells + 0.5 - MIN_OVERLAP_CELLS) - 1);

  const [x, y] = pile.position;
  const cells: Vector[] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    cells.push([x, y + dy]);
  }
  return cells;
}

/** Whether a pile can be grabbed by someone standing at the given cell. */
export function pileCoversCell(pile: MaterialPile, cell: Vector): boolean {
  return pileFootprint(pile).some((c) => vectorEquals(c, cell));
}
