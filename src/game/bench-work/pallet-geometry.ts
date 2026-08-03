import { Pallet, PalletNail } from "../Materials";
import { INCHES_PER_FOOT } from "../shop-scale";
import { lerp } from "../../utils/mathUtils";

/**
 * The pallet's physical layout, in inches from its top-left corner — the
 * single source of truth shared by the floor sprite (PalletSprite), the
 * bench view's pry scene, and the tests. One module so the nail the
 * player clicks, the board that pops free, and the spot it stays lying
 * in can never disagree about where anything is.
 *
 * The layout mirrors a real stringer pallet flattened to top-down view:
 * four bottom deck boards and seven top deck boards running the short
 * way, three stringers running the long way between them. Every crossing
 * of two present boards carries one nail (Pallet.nails), and a board
 * only comes free when its last nail is pried — every nail is in two
 * boards, and pulling it loosens both (see pryPalletNailAction).
 */

export const MAX_STRINGERS = 3;
export const MAX_TOP_DECK = 7;
export const MAX_BOTTOM_DECK = 4;

/** The pallet's span: 4' × 3' minus a hair so it reads inside its cells. */
export const PALLET_WIDTH_IN = 4 * INCHES_PER_FOOT - 2;
export const PALLET_HEIGHT_IN = 3 * INCHES_PER_FOOT - 2;

/** One of the pallet's boards, by which row it's nailed into. */
export type PalletBoardRef =
  | { readonly kind: "deck"; readonly index: number }
  | { readonly kind: "stringer"; readonly index: number };

/** One board's berth on the pallet: where it lies while nailed in. */
export interface PalletBoardSlot {
  readonly target: PalletBoardRef;
  /** Board center, in pallet inches from the top-left corner. */
  readonly xIn: number;
  readonly yIn: number;
  /** Degrees the board is turned from vertical (length running down). */
  readonly angleDeg: number;
  /** Draw order: bottom deck under stringers under top deck. */
  readonly layer: "bottom" | "stringer" | "top";
}

/** Where a slot's board lies, present or not — freed boards keep lying
 * right where they were nailed, so the bench view needs the berth even
 * after the board leaves the pallet. */
export function palletBoardSlot(target: PalletBoardRef): PalletBoardSlot {
  if (target.kind === "stringer") {
    return {
      target,
      xIn: PALLET_WIDTH_IN / 2,
      yIn: stringerYIn(target.index),
      angleDeg: 90,
      layer: "stringer",
    };
  }
  return {
    target,
    xIn: deckBoardXIn(target.index),
    yIn: PALLET_HEIGHT_IN / 2,
    angleDeg: 0,
    layer: target.index < MAX_BOTTOM_DECK ? "bottom" : "top",
  };
}

/** Every board still nailed to the pallet, in draw order (bottom deck,
 * stringers, top deck — so the top row reads on top). */
export function palletBoardSlots(
  pallet: Pallet,
): ReadonlyArray<PalletBoardSlot> {
  const deck = pallet.deckBoards.flatMap((present, index) =>
    present ? [palletBoardSlot({ kind: "deck", index })] : [],
  );
  const stringers = pallet.stringers.flatMap((present, index) =>
    present ? [palletBoardSlot({ kind: "stringer", index })] : [],
  );
  const order = { bottom: 0, stringer: 1, top: 2 } as const;
  return [...deck, ...stringers].sort(
    (a, b) => order[a.layer] - order[b.layer],
  );
}

/** A stringer's centerline, in pallet inches from the top edge. */
export function stringerYIn(index: number): number {
  return lerp(0, PALLET_HEIGHT_IN, index / (MAX_STRINGERS - 1));
}

/** A deck board's centerline, in pallet inches from the left edge. Top
 * boards (4..10) spread edge to edge by sevens; bottom boards (0..3)
 * sit on the gaps between them — offset half a bay, so in the flattened
 * top-down view they peek through instead of hiding underneath, and no
 * bottom-board crossing ever lands on a top board's nail. */
export function deckBoardXIn(index: number): number {
  return index < MAX_BOTTOM_DECK
    ? lerp(0, PALLET_WIDTH_IN, (index + 0.5) / MAX_BOTTOM_DECK)
    : lerp(0, PALLET_WIDTH_IN, (index - MAX_BOTTOM_DECK) / (MAX_TOP_DECK - 1));
}

/** Where a nail sits: on the crossing of its deck board and stringer. */
export function palletNailPosition(nail: PalletNail): {
  xIn: number;
  yIn: number;
} {
  return { xIn: deckBoardXIn(nail.deck), yIn: stringerYIn(nail.stringer) };
}

/** A fresh pallet's nails: one at every crossing of two present boards.
 * Deck-major order, so the driver's untargeted pulls walk board by board. */
export function initialPalletNails(
  deckBoards: ReadonlyArray<boolean>,
  stringers: ReadonlyArray<boolean>,
): ReadonlyArray<PalletNail> {
  const nails: PalletNail[] = [];
  deckBoards.forEach((deckPresent, deck) => {
    if (!deckPresent) return;
    stringers.forEach((stringerPresent, stringer) => {
      if (stringerPresent) nails.push({ deck, stringer });
    });
  });
  return nails;
}

/** Whether two nail references name the same crossing. */
export function isSameNail(
  a: PalletNail | null | undefined,
  b: PalletNail,
): boolean {
  return a != null && a.deck === b.deck && a.stringer === b.stringer;
}
