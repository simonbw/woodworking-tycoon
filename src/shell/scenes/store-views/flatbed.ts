import { Graphics } from "pixi.js";
import { cellToPixel } from "../../../components/shop-view/shop-scale";

/**
 * The orange flatbed's drawing, shared by the corral's nested row and
 * the pushed cart — copied from the old StorePushCartSprite rather than
 * imported, because that module leans on @pixi/react (which the engine
 * bundle must not carry — phase 8 deletes it). Same numbers, same look:
 * the thing you take is the thing you saw.
 */

export const FRAME = 0xe06010;
export const FRAME_DARK = 0xa8490c;
export const DECK = 0x6b5637;
export const DECK_SEAM = 0x57452c;
export const KRAFT = 0xb98d54;
export const KRAFT_EDGE = 0x8a6537;

/** The deck, in cells — a real flatbed's four-and-a-half by two and a
 * half feet, long axis toward the handle. */
export const FLATBED_LENGTH_CELLS = 2.3;
export const FLATBED_WIDTH_CELLS = 1.25;

/** An orange flatbed's deck, drawn about its own center with the handle
 * end toward +x. */
export function drawFlatbed(g: Graphics): void {
  const l = cellToPixel(FLATBED_LENGTH_CELLS);
  const w = cellToPixel(FLATBED_WIDTH_CELLS);
  // The deck: dark plywood over the frame, seamed down the middle.
  g.roundRect(-l / 2, -w / 2, l, w, 3);
  g.fill(DECK);
  g.rect(-l / 2 + 3, -1, l - 6, 2);
  g.fill(DECK_SEAM);
  // The frame shows as orange rails across both short ends.
  g.rect(-l / 2, -w / 2, 5, w);
  g.rect(l / 2 - 5, -w / 2, 5, w);
  g.fill(FRAME);
}

/** The upright handle past the shopper's end — drawn over the load,
 * because it stands taller than anything lying on the deck. */
export function drawFlatbedHandle(g: Graphics): void {
  const l = cellToPixel(FLATBED_LENGTH_CELLS);
  const w = cellToPixel(FLATBED_WIDTH_CELLS);
  g.rect(l / 2 + 2, -w / 2 + 2, 3.5, w - 4);
  g.fill(FRAME);
  g.rect(l / 2 - 5, -w / 2 + 2, 8, 2.5);
  g.rect(l / 2 - 5, w / 2 - 4.5, 8, 2.5);
  g.fill(FRAME_DARK);
}
