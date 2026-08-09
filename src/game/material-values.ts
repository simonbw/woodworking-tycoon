import {
  Board,
  Finish,
  FinishedProduct,
  MaterialInstance,
  SheetGood,
  SheetGoodKind,
  Species,
} from "./Materials";
import { isFinishedProduct } from "./material-helpers";
import { TOOL_TYPES } from "./Tool";

/**
 * What things are worth, in the shop's two directions.
 *
 * **Wood has a price you pay and no price you receive.** Lumber and sheet
 * goods are priced for the store shelf (`SPECIES_LUMBER_PRICE`,
 * `SHEET_KIND_PRICE`) and are worth exactly nothing on the way out — a
 * board is what you work, not what you sell. Only finished products, and
 * the odd secondhand tool, have a sell value at all.
 *
 * That asymmetry is the whole economy. Value comes from work, never from
 * holding wood, so there is no board-foot arbitrage to find and no reason
 * to treat a scavenging run as income. Products are priced at realistic
 * craft-fair prices — worth more than the wood in them, with margins thin
 * from expensive lumber channels and fat from cheap ones, so every channel
 * unlock reprices the shop's work. Commissions and jobs pay above these
 * prices; listings are the living, commissions are the milestones.
 */

/**
 * Real lumber volume: one board foot is 12" × 12" × 1". Board dimensions
 * are length in inches, width in inches, thickness in quarters of an inch
 * (see Materials.ts), so the conversion collapses to /576.
 */
function boardFeet(
  lengthInches: number,
  widthInches: number,
  thicknessQuarters: number,
): number {
  return (lengthInches * widthInches * thicknessQuarters) / 576;
}

/**
 * A sheet's board footage: face area in square feet times inches of
 * thickness (both cross dimensions are stored in inches).
 */
function sheetBoardFeet(sheet: SheetGood): number {
  return (sheet.length / 12) * (sheet.width / 12) * (sheet.thickness / 4);
}

const PRODUCT_VALUES: Record<FinishedProduct["type"], number> = {
  rusticShelf: 12,
  // Screwed joinery and bought fasteners edge it past the nailed shelf
  planterBox: 13,
  shelf: 9,
  simpleCuttingBoard: 8,
  // The strip-board tiers: same materials, fancier patterns, better money
  stripedCuttingBoard: 12,
  sunriseCuttingBoard: 20,
  // Two glue-ups, two flattenings, and a jig you built yourself
  endGrainCuttingBoard: 30,
  jewelryBox: 18,
  // Four miters that have to close, off free pallet stock — the first
  // build that needs the saw, the rip fence, and the sander all at once
  rusticFrame: 12,
  // Eight miters that all have to close up — precision money
  pictureFrame: 11,
  // The rustic tier below the shelf: quick nailed builds from scrap
  // Six boards, two of them mitered — fiddlier than its old four-board
  // self, and priced up accordingly
  birdhouse: 10,
  crate: 10,
  // Screwed like the planter box, but it has to hold a person
  stepStool: 14,
  // Twelve 30° miters — the saw's other stops earning their keep
  hexFrame: 15,
  // A panel wrapped in mitered rails: two systems in one piece
  servingTray: 18,
  bookshelf: 26,
  // The first real furniture: a wide glued top on four legs
  sideTable: 44,
  // Striped slices, alternated: the showpiece above the butcher block
  checkerboardCuttingBoard: 50,
};

/**
 * The wood tier ladder (issue #6), used to scale FINISHED PRODUCT values:
 * better species multiply the profit on everything you build. Lumber is
 * priced separately by SPECIES_LUMBER_PRICE below — real hardwood price
 * gaps (walnut is ~16x construction pine per board foot) would be absurd
 * multipliers on product prices.
 */
export const SPECIES_VALUE_MULTIPLIER: Record<Species, number> = {
  pallet: 1,
  pine: 1,
  poplar: 1.2,
  oak: 2.5,
  maple: 3,
  cherry: 4,
  walnut: 5,
  mahogany: 6,
  purpleHeart: 8,
};

/**
 * Shelf price of lumber in dollars per board foot, before a channel's own
 * multiplier (see lumberStock.ts). These are real-world retail: a 2×4×8
 * stud lands at $4, big-box poplar near $5/bf, lumberyard walnut at
 * $12/bf.
 *
 * This is a *purchase* rate and has no sell-side twin — wood costs money
 * to bring in and returns none going out.
 */
export const SPECIES_LUMBER_PRICE: Record<Species, number> = {
  // Never on a shelf: pallet wood comes off the curb, free. The entry
  // keeps the Record exhaustive, and a $0 board would be an obvious bug
  // if some future channel ever tried to stock it.
  pallet: 0,
  pine: 0.75,
  poplar: 3.0,
  oak: 4.5,
  maple: 5.25,
  cherry: 7.5,
  walnut: 12.0,
  mahogany: 13.5,
  purpleHeart: 16.5,
};

/**
 * Shelf price of sheet goods per board foot, same ladder ordering as the
 * species table (particle board cheapest, cabinet ply dearest): a 4'×8'
 * half-inch particle sheet near $20, a 4'×8' three-quarter cabinet-ply
 * sheet near $80 — big-box reality. This is full-sheet rate; smaller
 * pieces pay `sheetSizePremium` on top.
 */
export const SHEET_KIND_PRICE: Record<SheetGoodKind, number> = {
  particleBoard: 1.2,
  osb: 1.5,
  mdf: 1.65,
  plywoodC: 2.25,
  plywoodB: 3.0,
  plywoodA: 3.3,
};

/**
 * A finished finish sells better than raw wood. Each finish will earn its
 * multiplier a different way (cost, labor, cure time) as the finishing
 * system grows; mineral oil is the cheap, easy baseline.
 */
export const FINISH_VALUE_MULTIPLIER: Record<Finish, number> = {
  mineralOil: 1.25,
};

export function getSellValue(material: MaterialInstance): number {
  // Finished products price from their table (times species and finish);
  // isFinishedProduct keys off FINISHED_PRODUCT_TYPES, so a new product
  // lands here automatically once PRODUCT_VALUES knows its base value.
  if (isFinishedProduct(material)) {
    // Two-tone pieces average their species and add a style premium
    const speciesMultiplier = material.accentSpecies
      ? ((SPECIES_VALUE_MULTIPLIER[material.species] +
          SPECIES_VALUE_MULTIPLIER[material.accentSpecies]) /
          2) *
        1.5
      : SPECIES_VALUE_MULTIPLIER[material.species];
    const finishMultiplier = material.finish
      ? FINISH_VALUE_MULTIPLIER[material.finish]
      : 1;
    return roundToCents(
      PRODUCT_VALUES[material.type] * speciesMultiplier * finishMultiplier,
    );
  }

  // A used tool moves at half retail — nobody pays full price secondhand
  if (material.type === "tool") {
    return roundToCents(TOOL_TYPES[material.toolId].cost * 0.5);
  }

  // Everything else is stock — boards, sheets, panels, slices, whole
  // pallets — and stock does not sell. Build something out of it or throw
  // it away. A new raw material type lands here by default, which is the
  // rule rather than an oversight.
  return 0;
}

/**
 * Store price for a board. Each lumber channel scales the shelf rate by
 * its own multiplier (see lumberStock.ts): big-box S4S charges a premium
 * for milling you didn't do; rough stock is discounted because your
 * jointer and planer are about to do it.
 *
 * Surface doesn't enter into it — a channel's milled state is priced by
 * its multiplier, not by the board's condition.
 */
export function getBoardBuyPrice(
  board: Board,
  channelPriceMultiplier: number = 1,
): number {
  const basePrice =
    boardFeet(board.length, board.width, board.thickness) *
    SPECIES_LUMBER_PRICE[board.species];
  return roundToCents(basePrice * channelPriceMultiplier);
}

/** Face area of a full 4'×8' sheet, in square feet. */
const FULL_SHEET_SQ_FT = 32;

/**
 * How steeply small pieces are surcharged. Cutting a sheet down is
 * labor, and a store that has already done it charges for that: the
 * shelf rate is quoted for a full sheet, and every smaller piece pays a
 * premium on the ratio of its area to that.
 *
 * The exponent is picked so the rack's three sizes land on a ladder
 * worth deciding between: the full 4×8 sheet at the base rate, the 2×4
 * panel about 1.5× per square foot, the 2×2 project panel very nearly
 * double. That gap is the circular saw's whole business case (see
 * docs/sheet-goods.md).
 *
 * Total price still rises with size — a small piece is cheaper to buy
 * and dearer per foot, which is exactly the trap.
 */
const SMALL_PIECE_PREMIUM_EXPONENT = 0.3;

/**
 * The per-board-foot premium a piece of this size pays over full-sheet
 * rate. 1 for a full sheet or anything larger.
 */
export function sheetSizePremium(sheet: SheetGood): number {
  const areaSqFt = (sheet.length / 12) * (sheet.width / 12);
  if (areaSqFt <= 0 || areaSqFt >= FULL_SHEET_SQ_FT) {
    return 1;
  }
  return (FULL_SHEET_SQ_FT / areaSqFt) ** SMALL_PIECE_PREMIUM_EXPONENT;
}

/** Store price for a sheet good — the lumber shelf rule, plus the
 * small-piece premium. */
export function getSheetBuyPrice(sheet: SheetGood): number {
  return roundToCents(
    sheetBoardFeet(sheet) *
      SHEET_KIND_PRICE[sheet.kind] *
      sheetSizePremium(sheet),
  );
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
