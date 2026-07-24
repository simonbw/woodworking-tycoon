import { MaterialPile } from "./GameState";
import { MaterialInstance, panelWidth } from "./Materials";
import { INCHES_PER_FOOT, inchesToCells } from "./shop-scale";
import { Vector, vectorEquals } from "./Vectors";

/**
 * How much of a material must reach into a cell before you can grab it from
 * there — a sliver of overhanging tip doesn't count.
 */
const MIN_OVERLAP_CELLS = 0.25;

/** A pallet is 4' of stringer across by 3' of deck board along (PalletSprite). */
const PALLET_ACROSS_FEET = 4;
const PALLET_ALONG_FEET = 3;

/**
 * The floor a material covers where it lies, in inches. `across` runs along
 * the x axis, `along` runs down the y axis — matching how the sprites draw
 * (see MaterialSprite): long stock lies lengthwise on the vertical axis, and
 * only the broad materials (sheets, pallets) reach past a cell sideways.
 * Anything not listed is small enough to sit inside its own cell.
 */
export function materialExtentInches(material: MaterialInstance): {
  across: number;
  along: number;
} {
  switch (material.type) {
    case "board":
      // A board's width is in inches, its length in feet
      return {
        across: material.width,
        along: material.length * INCHES_PER_FOOT,
      };
    case "panel":
      // Glue-ups can pass a board's width — the strips add up in inches
      return {
        across: panelWidth(material),
        along: material.length * INCHES_PER_FOOT,
      };
    case "plywood":
      // Sheets measure in feet both ways
      return {
        across: material.width * INCHES_PER_FOOT,
        along: material.length * INCHES_PER_FOOT,
      };
    case "pallet":
      return {
        across: PALLET_ACROSS_FEET * INCHES_PER_FOOT,
        along: PALLET_ALONG_FEET * INCHES_PER_FOOT,
      };
    default:
      return { across: 0, along: 0 };
  }
}

/**
 * How many cells past the anchor a material of this extent reaches. A cell
 * |d| away from the anchor is overlapped by half the extent + 0.5 - d cells
 * of material; include it while that clears the minimum.
 */
function reachCells(extentInches: number): number {
  const halfCells = inchesToCells(extentInches) / 2;
  return Math.max(0, Math.ceil(halfCells + 0.5 - MIN_OVERLAP_CELLS) - 1);
}

/**
 * The cells a pile can be grabbed from: every cell its material meaningfully
 * overlaps. Piles render centered on their anchor cell (see
 * MaterialPilesSprite), so with 1-ft cells an 8' board reaches four cells
 * past its anchor along the vertical axis, a pallet or a sheet spreads both
 * ways, and anything a foot or under stays a one-cell grab.
 */
export function pileFootprint(pile: MaterialPile): Vector[] {
  const { across, along } = materialExtentInches(pile.material);
  const reachX = reachCells(across);
  const reachY = reachCells(along);

  const [x, y] = pile.position;
  const cells: Vector[] = [];
  for (let dx = -reachX; dx <= reachX; dx++) {
    for (let dy = -reachY; dy <= reachY; dy++) {
      cells.push([x + dx, y + dy]);
    }
  }
  return cells;
}

/** Whether a pile can be grabbed by someone standing at the given cell. */
export function pileCoversCell(pile: MaterialPile, cell: Vector): boolean {
  return pileFootprint(pile).some((c) => vectorEquals(c, cell));
}
