import { Vector } from "../../game/Vectors";

export const PIXELS_PER_INCH = 4; // the main defining scale
export const INCHES_PER_FOOT = 12;
export const INCHES_PER_CELL = 32;
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
