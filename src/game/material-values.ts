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
  simpleCuttingBoard: 40,
  jewelryBox: 90,
};

/**
 * The wood tier ladder (issue #6). One ladder is used on both sides of every
 * price: sell values scale by it, and buy prices are sell value x BUY_MARKUP,
 * so buying and flipping lumber loses money at every tier while better
 * species multiply the profit on finished products.
 */
export const SPECIES_VALUE_MULTIPLIER: Record<Species, number> = {
  pallet: 1,
  pine: 1,
  oak: 2.5,
  maple: 3,
  cherry: 4,
  walnut: 5,
  mahogany: 6,
  purpleHeart: 8,
};

export function getSellValue(material: MaterialInstance): number {
  switch (material.type) {
    case "board":
      return roundToCents(
        material.length *
          material.width *
          material.thickness *
          BOARD_VALUE_PER_UNIT *
          SPECIES_VALUE_MULTIPLIER[material.species],
      );
    case "plywood":
      return roundToCents(
        material.length *
          material.width *
          material.thickness *
          BOARD_VALUE_PER_UNIT,
      );
    case "panel":
      // Valued strip by strip, so multi-species panels price themselves
      return roundToCents(
        material.strips.reduce(
          (sum, strip) =>
            sum +
            material.length *
              strip.width *
              material.thickness *
              BOARD_VALUE_PER_UNIT *
              SPECIES_VALUE_MULTIPLIER[strip.species],
          0,
        ),
      );
    case "pallet":
      return WHOLE_PALLET_VALUE;
    case "shelf":
    case "rusticShelf":
    case "jewelryBox":
    case "simpleCuttingBoard":
      return roundToCents(
        PRODUCT_VALUES[material.type] *
          SPECIES_VALUE_MULTIPLIER[material.species],
      );
    case "unknown":
      return 0;
  }
}

/**
 * Store prices for buying lumber. Kept well above sell value so buying and
 * flipping always loses money.
 */
const BUY_MARKUP = 3;

export function getBoardBuyPrice(board: Board): number {
  return roundToCents(getSellValue(board) * BUY_MARKUP);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
