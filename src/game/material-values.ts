import { Board, FinishedProduct, MaterialInstance, Species } from "./Materials";

/**
 * Free-sell prices. Value comes from processing depth: raw boards are priced
 * by volume, finished products are worth far more than the wood that went
 * into them. Commissions pay ~3x these prices — free selling is the grind,
 * commissions are the paydays.
 */
const BOARD_VALUE_PER_UNIT = 0.1;
const WHOLE_PALLET_VALUE = 5;

const PRODUCT_VALUES: Record<FinishedProduct["type"], number> = {
  rusticShelf: 60,
  shelf: 45,
  simpleCuttingBoard: 25,
  jewelryBox: 90,
};

export function getSellValue(material: MaterialInstance): number {
  switch (material.type) {
    case "board":
    case "plywood":
      return roundToCents(
        material.length *
          material.width *
          material.thickness *
          BOARD_VALUE_PER_UNIT,
      );
    case "pallet":
      return WHOLE_PALLET_VALUE;
    case "shelf":
    case "rusticShelf":
    case "jewelryBox":
    case "simpleCuttingBoard":
      return PRODUCT_VALUES[material.type];
    case "unknown":
      return 0;
  }
}

/**
 * Store prices for buying lumber. Kept well above sell value so buying and
 * flipping always loses money; the species ladder is a stub for the wood
 * tier system (issue #6), which will also differentiate sell values.
 */
const BUY_MARKUP = 3;
const SPECIES_PRICE_MULTIPLIER: Record<Species, number> = {
  pallet: 1,
  pine: 1,
  oak: 2.5,
  maple: 3,
  cherry: 4,
  walnut: 5,
  mahogany: 6,
  purpleHeart: 8,
};

export function getBoardBuyPrice(board: Board): number {
  return roundToCents(
    getSellValue(board) * BUY_MARKUP * SPECIES_PRICE_MULTIPLIER[board.species],
  );
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
