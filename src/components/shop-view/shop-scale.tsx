import { Vector } from "../../game/Vectors";

export const PIXELS_PER_INCH = 4;
export const CELL_SIZE = 28 * PIXELS_PER_INCH;
export const SPACING = 0;

export function scaled(n: number): number {
  return n * CELL_SIZE;
}

export function scaledVec([x, y]: Vector): Vector {
  return [scaled(x), scaled(y)];
}

export function cellCenter(position: Vector): Vector {
  return [scaled(position[0] + 0.5), scaled(position[1] + 0.5)];
}
