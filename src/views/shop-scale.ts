import { INCHES_PER_CELL, INCHES_PER_FOOT } from "../game/shop-scale";
import { Vector } from "../game/Vectors";

export const PIXELS_PER_INCH = 4; // the main defining scale

/**
 * The scale machine art is drawn at: every export measures 8 px to the
 * inch, so a sprite lands on its footprint at `pxPerIn / this`.
 *
 * The `@4x` close-up exports are *not* an exception. PIXI reads the
 * `@Nx` suffix as the texture's resolution, so a file with four times
 * the pixels reports the same logical size as its 1x twin — same 8 px
 * to the inch, four times as sharp. Dividing a close-up by 32 draws it
 * a quarter of the size it belongs.
 */
export const IMAGE_PIXELS_PER_INCH = 8;
export { INCHES_PER_CELL, INCHES_PER_FOOT };
export const PIXELS_PER_CELL = INCHES_PER_CELL * PIXELS_PER_INCH;
export const SPACING = 0;

export function feetToPixels(n: number): number {
  return n * INCHES_PER_FOOT * PIXELS_PER_INCH;
}

export function inchesToPixels(n: number): number {
  return n * PIXELS_PER_INCH;
}

export function cellToPixel(n: number): number {
  return n * PIXELS_PER_CELL;
}

export function cellToPixelVec([x, y]: Vector): Vector {
  return [cellToPixel(x), cellToPixel(y)];
}

export function cellToPixelCenter(position: Vector): Vector {
  return [cellToPixel(position[0] + 0.5), cellToPixel(position[1] + 0.5)];
}

export function pixelToCell(n: number): number {
  return Math.floor(n / PIXELS_PER_CELL);
}

export function pixelToCellVec([x, y]: Vector): Vector {
  return [pixelToCell(x), pixelToCell(y)];
}
