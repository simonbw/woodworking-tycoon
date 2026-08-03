import { Pallet } from "../Materials";
import { INCHES_PER_FOOT } from "../shop-scale";
import { lerp } from "../../utils/mathUtils";
import { PryTarget } from "./workpiece";

/**
 * The pallet's physical layout, in inches from its top-left corner — the
 * single source of truth shared by the floor sprite (PalletSprite), the
 * bench view's pry scene, and the tests. One module so the nail the
 * player clicks, the board that pops free, and the spot it stays lying
 * in can never disagree about where anything is.
 *
 * The layout mirrors a real stringer pallet flattened to top-down view:
 * four bottom deck boards and seven top deck boards running the short
 * way, three stringers running the long way between them. Every board
 * holds on by one nail (the game's one-nail-per-board model — see
 * pryPalletNailAction).
 */

export const MAX_STRINGERS = 3;
export const MAX_TOP_DECK = 7;
export const MAX_BOTTOM_DECK = 4;

/** The pallet's span: 4' × 3' minus a hair so it reads inside its cells. */
export const PALLET_WIDTH_IN = 4 * INCHES_PER_FOOT - 2;
export const PALLET_HEIGHT_IN = 3 * INCHES_PER_FOOT - 2;

/** One board's berth on the pallet: where it lies while nailed in. */
export interface PalletBoardSlot {
  readonly target: PryTarget;
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
export function palletBoardSlot(target: PryTarget): PalletBoardSlot {
  if (target.kind === "stringer") {
    return {
      target,
      xIn: PALLET_WIDTH_IN / 2,
      yIn: lerp(0, PALLET_HEIGHT_IN, target.index / (MAX_STRINGERS - 1)),
      angleDeg: 90,
      layer: "stringer",
    };
  }
  const bottom = target.index < MAX_BOTTOM_DECK;
  const across = bottom
    ? target.index / (MAX_BOTTOM_DECK - 1)
    : (target.index - MAX_BOTTOM_DECK) / (MAX_TOP_DECK - 1);
  return {
    target,
    xIn: lerp(0, PALLET_WIDTH_IN, across),
    yIn: PALLET_HEIGHT_IN / 2,
    angleDeg: 0,
    layer: bottom ? "bottom" : "top",
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
  const stringers = Array.from({ length: pallet.stringerBoardsLeft }, (_, i) =>
    palletBoardSlot({ kind: "stringer", index: i }),
  );
  const order = { bottom: 0, stringer: 1, top: 2 } as const;
  return [...deck, ...stringers].sort(
    (a, b) => order[a.layer] - order[b.layer],
  );
}

/**
 * Where a board's one nail sits, in pallet inches. Deck boards wear
 * theirs near the middle stringer (bottom row just below it, top row
 * just above); stringers wear theirs at mid-span.
 */
export function palletNailPosition(target: PryTarget): {
  xIn: number;
  yIn: number;
} {
  const slot = palletBoardSlot(target);
  if (target.kind === "stringer") {
    return { xIn: slot.xIn, yIn: slot.yIn };
  }
  const bottom = target.index < MAX_BOTTOM_DECK;
  return { xIn: slot.xIn, yIn: slot.yIn + (bottom ? 6 : -6) };
}
