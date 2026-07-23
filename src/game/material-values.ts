import {
  Board,
  Finish,
  FinishedProduct,
  MaterialInstance,
  SheetGood,
  SheetGoodKind,
  Species,
  SurfaceCondition,
} from "./Materials";

/**
 * Free-sell prices. Value comes from processing depth: raw stock is priced
 * by real board-foot volume at per-species rates, finished products are
 * worth far more than the wood that went into them. Commissions pay ~3x
 * these prices — free selling is the grind, commissions are the paydays.
 */
const WHOLE_PALLET_VALUE = 5;

/**
 * Real lumber volume: one board foot is 12" × 12" × 1". Board dimensions
 * are length in feet, width in inches, thickness in quarters of an inch
 * (see Materials.ts), so the conversion collapses to /48.
 */
function boardFeet(
  lengthFeet: number,
  widthInches: number,
  thicknessQuarters: number,
): number {
  return (lengthFeet * widthInches * thicknessQuarters) / 48;
}

/**
 * Sheets measure both cross dimensions in feet, so their board footage is
 * square feet times inches of thickness.
 */
function sheetBoardFeet(sheet: SheetGood): number {
  return sheet.length * sheet.width * (sheet.thickness / 4);
}

/**
 * A crosscut slice's share of the 2' panel it came from (SLICES_PER_PANEL
 * cuts): 6" of panel length.
 */
const SLICE_LENGTH_FEET = 0.5;

const PRODUCT_VALUES: Record<FinishedProduct["type"], number> = {
  rusticShelf: 60,
  // Screwed joinery and bought fasteners edge it past the nailed shelf
  planterBox: 65,
  shelf: 45,
  simpleCuttingBoard: 40,
  // The strip-board tiers: same materials, fancier patterns, better money
  stripedCuttingBoard: 60,
  sunriseCuttingBoard: 100,
  // Two glue-ups, two flattenings, and a jig you built yourself
  endGrainCuttingBoard: 150,
  jewelryBox: 90,
  // Eight miters that all have to close up — precision money
  pictureFrame: 55,
};

/**
 * The wood tier ladder (issue #6), used to scale FINISHED PRODUCT values:
 * better species multiply the profit on everything you build. Raw lumber
 * is priced separately by SPECIES_LUMBER_RATE below — real hardwood price
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
 * Raw lumber sell rates in dollars per board foot, tuned so store shelves
 * (sell rate × BUY_MARKUP × channel multiplier) land near real-world
 * retail: a $4 stud, $5/bf big-box poplar, $12/bf lumberyard walnut.
 *
 * Pallet wood is the exception: reclaimed craft stock, never on a store
 * shelf. Its rate is what neighbors pay per board ($1.20 a deck board),
 * not commodity volume — which keeps the scavenge-and-sell early game and
 * its job-board payouts exactly where they were.
 */
export const SPECIES_LUMBER_RATE: Record<Species, number> = {
  pallet: 4.8,
  pine: 0.25,
  poplar: 1.0,
  oak: 1.5,
  maple: 1.75,
  cherry: 2.5,
  walnut: 4.0,
  mahogany: 4.5,
  purpleHeart: 5.5,
};

/**
 * Sheet-good sell rates in dollars per board foot, same ladder ordering as
 * before (particle board cheapest, cabinet ply dearest). At BUY_MARKUP
 * these put a 4'×4' half-inch particle sheet near $10 and a 4'×8'
 * three-quarter cabinet-ply sheet near $80 — big-box reality.
 */
export const SHEET_KIND_RATE: Record<SheetGoodKind, number> = {
  particleBoard: 0.4,
  osb: 0.5,
  mdf: 0.55,
  plywoodC: 0.75,
  plywoodB: 1.0,
  plywoodA: 1.1,
};

/**
 * Surface prep adds a little value to raw stock — enough to reward sanding
 * scavenged boards, not enough to beat turning them into products.
 */
export const SURFACE_VALUE_MULTIPLIER: Record<SurfaceCondition, number> = {
  rough: 1,
  smooth: 1.15,
  sanded: 1.3,
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
  switch (material.type) {
    case "board":
      return roundToCents(
        boardFeet(material.length, material.width, material.thickness) *
          SPECIES_LUMBER_RATE[material.species] *
          SURFACE_VALUE_MULTIPLIER[material.surface],
      );
    case "plywood":
      return roundToCents(
        sheetBoardFeet(material) * SHEET_KIND_RATE[material.kind],
      );
    case "panel":
      // Valued strip by strip, so multi-species panels price themselves
      return roundToCents(
        material.strips.reduce(
          (sum, strip) =>
            sum +
            boardFeet(material.length, strip.width, material.thickness) *
              SPECIES_LUMBER_RATE[strip.species],
          0,
        ) * SURFACE_VALUE_MULTIPLIER[material.surface],
      );
    case "endGrainSlice":
      // A slice is its share of the panel it was crosscut from
      return roundToCents(
        material.strips.reduce(
          (sum, strip) =>
            sum +
            boardFeet(SLICE_LENGTH_FEET, strip.width, material.thickness) *
              SPECIES_LUMBER_RATE[strip.species],
          0,
        ),
      );
    case "pallet":
      return WHOLE_PALLET_VALUE;
    case "sawdustPile":
      // Waste, for now — someday bedding or briquettes
      return 0;
    case "shelf":
    case "rusticShelf":
    case "planterBox":
    case "jewelryBox":
    case "pictureFrame":
    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard": {
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
    case "unknown":
      return 0;
  }
}

/**
 * Store prices for buying lumber. Kept well above sell value so buying and
 * flipping always loses money. Each lumber channel scales the base price by
 * its own multiplier (see lumberStock.ts): big-box S4S charges a premium
 * for milling you didn't do; rough stock is discounted because your jointer
 * and planer are about to do it.
 */
const BUY_MARKUP = 3;

export function getBoardBuyPrice(
  board: Board,
  channelPriceMultiplier: number = 1,
): number {
  // Priced from raw wood volume (rough sell value), so the small surface
  // sell-bonus doesn't inflate store prices.
  const basePrice = getSellValue({ ...board, surface: "rough" }) * BUY_MARKUP;
  return roundToCents(basePrice * channelPriceMultiplier);
}

/** Store price for a sheet good — same markup rule as lumber. */
export function getSheetBuyPrice(sheet: SheetGood): number {
  return roundToCents(getSellValue(sheet) * BUY_MARKUP);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
