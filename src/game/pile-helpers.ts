import { MaterialPile } from "./GameState";
import { MaterialInstance, panelWidth } from "./Materials";
import { cellCenter } from "./player-motion";
import { INCHES_PER_FOOT, inchesToCells } from "./shop-scale";
import { Vector } from "./Vectors";

/**
 * How far past a standing cell's center the arms reach, in cells. A pile
 * counts as grabbable when its material's footprint comes within this of
 * the cell the player occupies — the continuous replacement for the old
 * one-cell-grab: a piece resting anywhere in your cell is in reach, a
 * piece centered in the next cell over is not.
 */
const PILE_REACH_CELLS = 0.75;

/** A pallet is one board square — 3' by 3' (PalletSprite). */
const PALLET_ACROSS_FEET = 3;
const PALLET_ALONG_FEET = 3;

/**
 * The floor a material covers where it lies, in inches. `across` runs along
 * the x axis, `along` runs down the y axis — matching how the sprites draw
 * (see MaterialSprite): long stock lies lengthwise on the vertical axis, and
 * only the broad materials (sheets, pallets) reach past a cell sideways.
 * Anything not listed is small enough to count as a point.
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
        along: material.length,
      };
    case "panel":
      // Glue-ups can pass a board's width — the strips add up in inches
      return {
        across: panelWidth(material),
        along: material.length,
      };
    case "plywood":
      // Sheets measure in feet both ways
      return {
        across: material.width,
        along: material.length,
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
 * Whether a pile can be grabbed by someone standing at the given cell.
 * Piles sit at continuous positions (`pile.position` is the material's
 * center point, in cell units — see docs/continuous-movement.md), so reach
 * is geometry, not cell membership: the distance from the standing cell's
 * center to the material's resting rectangle, against PILE_REACH_CELLS.
 * Long stock is grabbable anywhere along its length this way, with no
 * special casing for the cells it overhangs. The rectangle lies at the
 * pile's rotation — a board dropped mid-stride is reachable along where
 * it actually points, not along an axis-aligned ghost of it.
 */
export function pileWithinReach(pile: MaterialPile, cell: Vector): boolean {
  const { across, along } = materialExtentInches(pile.material);
  const halfX = inchesToCells(across) / 2;
  const halfY = inchesToCells(along) / 2;
  const [cx, cy] = cellCenter(cell);
  const [px, py] = pile.position;
  // Carry the offset into the piece's own frame, then it's a plain
  // distance-to-axis-aligned-rectangle again.
  const cos = Math.cos(pile.rotation);
  const sin = Math.sin(pile.rotation);
  const wx = cx - px;
  const wy = cy - py;
  const lx = wx * cos + wy * sin;
  const ly = -wx * sin + wy * cos;
  const dx = Math.max(Math.abs(lx) - halfX, 0);
  const dy = Math.max(Math.abs(ly) - halfY, 0);
  return Math.hypot(dx, dy) <= PILE_REACH_CELLS;
}
