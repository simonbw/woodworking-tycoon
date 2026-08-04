import { BoardDimension, SheetGoodKind, SheetThickness } from "./Materials";

/**
 * One slot in the store's sheet-good rack. Like the lumber channels, the
 * rack is reputation-gated and locked SKUs are fully hidden — no grayed-out
 * teasers. The starter rack is jig stock and cheap carcass filler; the
 * cabinet-grade sheets appear alongside the lumberyard, when a shop has
 * work worth putting good faces on.
 */
export interface SheetSku {
  readonly kind: SheetGoodKind;
  /** Inches — a full sheet is 96 × 48. */
  readonly length: number;
  readonly width: number;
  readonly thickness: SheetThickness;
  /** Store-voice flavor line on the product card. */
  readonly tagline: string;
  readonly minReputation: number;
}

export const SHEET_SKUS: ReadonlyArray<SheetSku> = [
  {
    kind: "particleBoard",
    length: 48,
    width: 48,
    thickness: 2,
    tagline: "Pressed wood chips. The cheapest sheet stock, and the weakest.",
    minReputation: 0,
  },
  {
    kind: "osb",
    length: 48,
    width: 48,
    thickness: 2,
    tagline: "Pressed wood strands. Structural sheathing, rough on both faces.",
    minReputation: 0,
  },
  {
    kind: "plywoodC",
    length: 48,
    width: 48,
    thickness: 2,
    tagline: "Construction-grade plywood. Knots and voids in both faces.",
    minReputation: 0,
  },
  {
    kind: "plywoodB",
    length: 48,
    width: 48,
    thickness: 2,
    tagline:
      "Utility-grade plywood. Sound faces, patched knots. Standard jig stock.",
    minReputation: 0,
  },
  {
    kind: "mdf",
    length: 48,
    width: 48,
    thickness: 3,
    tagline:
      "Medium-density fiberboard. Flat and grainless, with no wood grain to follow.",
    minReputation: 12,
  },
  {
    kind: "plywoodA",
    length: 96,
    width: 48,
    thickness: 3,
    tagline: "Cabinet-grade plywood. Clean veneer on both faces.",
    minReputation: 12,
  },
];

/** The rack the player has earned. Locked SKUs don't render at all. */
export function unlockedSheetSkus(reputation: number): ReadonlyArray<SheetSku> {
  return SHEET_SKUS.filter((sku) => reputation >= sku.minReputation);
}
