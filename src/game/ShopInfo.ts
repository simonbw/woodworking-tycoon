import { Vector } from "./Vectors";

export interface ShopInfo {
  name: string;
  electricity: 120 | 240;
  size: Vector;
  materialDropoffPosition: Vector;
  /** Center cell of the garage door: where deliveries land (machine
   * crates spawn on the nearest open floor) and the middle of the door
   * strip along the bottom wall. */
  entrancePosition: Vector;
}

/** Half-width of the garage door strip, in cells — a 7-ft door. */
export const DOOR_HALF_WIDTH = 3;

/** The garage door sits at the bottom edge, middle of the wall. */
export function defaultEntrancePosition(size: Vector): Vector {
  return [Math.floor(size[0] / 2), size[1] - 1];
}
