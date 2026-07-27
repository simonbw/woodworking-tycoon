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
  /** Feet — sheets measure both cross dimensions in feet. */
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: SheetThickness;
  /** Store-voice flavor line on the product card. */
  readonly tagline: string;
  readonly minReputation: number;
}

export const SHEET_SKUS: ReadonlyArray<SheetSku> = [
  {
    kind: "particleBoard",
    length: 4,
    width: 4,
    thickness: 2,
    tagline: "Pressed wood chips. The cheapest sheet stock, and the weakest.",
    minReputation: 0,
  },
  {
    kind: "osb",
    length: 4,
    width: 4,
    thickness: 2,
    tagline: "Pressed wood strands. Structural sheathing, rough on both faces.",
    minReputation: 0,
  },
  {
    kind: "plywoodC",
    length: 4,
    width: 4,
    thickness: 2,
    tagline: "Construction-grade plywood. Knots and voids in both faces.",
    minReputation: 0,
  },
  {
    kind: "plywoodB",
    length: 4,
    width: 4,
    thickness: 2,
    tagline:
      "Utility-grade plywood. Sound faces, patched knots. Standard jig stock.",
    minReputation: 0,
  },
  {
    kind: "mdf",
    length: 4,
    width: 4,
    thickness: 3,
    tagline:
      "Medium-density fiberboard. Flat and grainless, with no wood grain to follow.",
    minReputation: 12,
  },
  {
    kind: "plywoodA",
    length: 8,
    width: 4,
    thickness: 3,
    tagline: "Cabinet-grade plywood. Clean veneer on both faces.",
    minReputation: 12,
  },
];

/** The rack the player has earned. Locked SKUs don't render at all. */
export function unlockedSheetSkus(reputation: number): ReadonlyArray<SheetSku> {
  return SHEET_SKUS.filter((sku) => reputation >= sku.minReputation);
}
