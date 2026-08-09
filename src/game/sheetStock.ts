import { SheetGoodKind, SheetThickness } from "./Materials";

/**
 * The sizes the store racks sheet goods in. A sheet is sold by the piece
 * and cut by the player (see docs/sheet-goods.md), so size is a real
 * purchasing decision rather than a label: the full sheet is the
 * cheapest wood per square foot in the building, and the small panels
 * charge steeply for having already been cut.
 *
 * What a size costs isn't stored here: `sheetSizePremium` charges by
 * face area, so these three land on a ladder (full sheet at the base
 * rate, 2×4 panel around 1.5×, 2×2 panel around 1.9×) and an offcut
 * prices on the same curve as everything else.
 */
export interface SheetSize {
  readonly id: "full" | "handy" | "project";
  /** How the rack tag names it. */
  readonly label: string;
  /** Inches. */
  readonly length: number;
  readonly width: number;
}

export const SHEET_SIZES: ReadonlyArray<SheetSize> = [
  { id: "full", label: "4×8 Sheet", length: 96, width: 48 },
  { id: "handy", label: "2×4 Panel", length: 48, width: 24 },
  { id: "project", label: "2×2 Panel", length: 24, width: 24 },
];

export function sheetSize(id: SheetSize["id"]): SheetSize {
  const size = SHEET_SIZES.find((candidate) => candidate.id === id);
  if (!size) {
    throw new Error(`Unknown sheet size: ${id}`);
  }
  return size;
}

/**
 * One kind on the store's sheet-good rack. Like the lumber channels the
 * rack is reputation-gated and locked kinds are fully hidden — no
 * grayed-out teasers. The starter rack is jig stock and cheap carcass
 * filler; the cabinet-grade sheets appear alongside the lumberyard, when
 * a shop has work worth putting good faces on.
 *
 * Every kind is racked in every size. A store that stocked cabinet ply
 * only by the full sheet would be more realistic and much more annoying:
 * the size you can handle is already gated by what you can cut, so
 * gating it twice just hides stock behind a rule the player can't see.
 */
export interface SheetSku {
  readonly kind: SheetGoodKind;
  readonly thickness: SheetThickness;
  /** Store-voice flavor line on the product card. */
  readonly tagline: string;
  readonly minReputation: number;
}

export const SHEET_SKUS: ReadonlyArray<SheetSku> = [
  {
    kind: "particleBoard",
    thickness: 2,
    tagline: "Pressed wood chips. The cheapest sheet stock, and the weakest.",
    minReputation: 0,
  },
  {
    kind: "osb",
    thickness: 2,
    tagline: "Pressed wood strands. Structural sheathing, rough on both faces.",
    minReputation: 0,
  },
  {
    kind: "plywoodC",
    thickness: 2,
    tagline: "Construction-grade plywood. Knots and voids in both faces.",
    minReputation: 0,
  },
  {
    kind: "plywoodB",
    thickness: 2,
    tagline:
      "Utility-grade plywood. Sound faces, patched knots. Standard jig stock.",
    minReputation: 0,
  },
  {
    kind: "mdf",
    thickness: 3,
    tagline:
      "Medium-density fiberboard. Flat and grainless, with no wood grain to follow.",
    minReputation: 12,
  },
  {
    kind: "plywoodA",
    thickness: 3,
    tagline: "Cabinet-grade plywood. Clean veneer on both faces.",
    minReputation: 12,
  },
];

/** The rack the player has earned. Locked kinds don't render at all. */
export function unlockedSheetSkus(reputation: number): ReadonlyArray<SheetSku> {
  return SHEET_SKUS.filter((sku) => reputation >= sku.minReputation);
}
