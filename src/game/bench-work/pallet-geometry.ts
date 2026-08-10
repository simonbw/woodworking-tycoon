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
 * The layout mirrors a square pallet flattened to top-down view: three
 * bottom deck boards and five top deck boards running one way, three
 * stringers running the other way between them. Every board is the same
 * piece of stock — a pallet is one board, repeated eleven times — so
 * "deck" and "stringer" name only which way a board runs, never a
 * different size. Every crossing of two present boards carries one nail
 * (Pallet.nails), and a board only comes free when its last nail is
 * pried — every nail is in two boards, and pulling it loosens both (see
 * pryPalletNailAction).
 */

export const MAX_STRINGERS = 3;
export const MAX_TOP_DECK = 5;
export const MAX_BOTTOM_DECK = 3;

/** The pallet's span: 3' square minus a hair so it reads inside its cells. */
export const PALLET_WIDTH_IN = 3 * INCHES_PER_FOOT - 2;
export const PALLET_HEIGHT_IN = 3 * INCHES_PER_FOOT - 2;

/** The board's real dims — the one piece of stock prying frees, and the
 * only thing a pallet is made of. The assembled pallet is exactly one
 * board square (36" × 36"), centered on the slightly smaller nominal
 * span above: it overhangs the frame by an inch all around instead of
 * reading oversized in its floor cells. */
export const PALLET_BOARD_LENGTH_IN = 3 * INCHES_PER_FOOT;
export const PALLET_BOARD_WIDTH_IN = 4;
/** Thickness in quarters — 4/4, one nominal inch. */
export const PALLET_BOARD_THICKNESS_Q = 4;

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

/** A stringer's centerline, in pallet inches from the top edge. The
 * outer stringers' outer faces sit flush with the deck boards' ends —
 * spreading them across the frame instead left them proud of the deck. */
export function stringerYIn(index: number): number {
  const y0 =
    (PALLET_HEIGHT_IN - PALLET_BOARD_LENGTH_IN + PALLET_BOARD_WIDTH_IN) / 2;
  const y1 =
    (PALLET_HEIGHT_IN + PALLET_BOARD_LENGTH_IN - PALLET_BOARD_WIDTH_IN) / 2;
  return lerp(y0, y1, index / (MAX_STRINGERS - 1));
}

/** A deck board's centerline, in pallet inches from the left edge. Top
 * boards (3..7) spread by fives, the outer two flush with the stringers'
 * ends; bottom boards (0..2) spread by thirds, so the outer two straddle
 * the top row's bays and peek through in the flattened top-down view.
 * The middle one lands under the middle top board — where a real
 * pallet's bottom board goes, under the load. */
export function deckBoardXIn(index: number): number {
  const x0 =
    (PALLET_WIDTH_IN - PALLET_BOARD_LENGTH_IN + PALLET_BOARD_WIDTH_IN) / 2;
  const x1 =
    (PALLET_WIDTH_IN + PALLET_BOARD_LENGTH_IN - PALLET_BOARD_WIDTH_IN) / 2;
  return index < MAX_BOTTOM_DECK
    ? lerp(x0, x1, (index + 0.5) / MAX_BOTTOM_DECK)
    : lerp(x0, x1, (index - MAX_BOTTOM_DECK) / (MAX_TOP_DECK - 1));
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

/** Which face a nail's head is on — the side its deck board lives on. */
export function nailFace(nail: PalletNail): "top" | "bottom" {
  return nail.deck < MAX_BOTTOM_DECK ? "bottom" : "top";
}

/** The nails whose heads the shown face presents: top-deck nails on the
 * top face, bottom-deck nails when the pallet is flipped over. The rest
 * are driven from the other side — flip to get at them. */
export function faceNails(
  pallet: Pallet,
  flipped: boolean,
): ReadonlyArray<PalletNail> {
  const face = flipped ? "bottom" : "top";
  return pallet.nails.filter((nail) => nailFace(nail) === face);
}

/** The stable id a pallet's board frees under — also its grain seed. */
export function palletSlotId(
  pallet: { id: string },
  target: PalletBoardRef,
): string {
  return `${pallet.id}:${target.kind}-${target.index}`;
}

/** The slot a freed board came out of, recovered from its id — or null
 * for stock that never was part of this pallet. */
export function palletSlotRefFromId(
  palletId: string,
  materialId: string,
): PalletBoardRef | null {
  if (!materialId.startsWith(`${palletId}:`)) return null;
  const suffix = materialId.slice(palletId.length + 1);
  const match = /^(deck|stringer)-(\d+)$/.exec(suffix);
  if (!match) return null;
  return { kind: match[1] as "deck" | "stringer", index: Number(match[2]) };
}
