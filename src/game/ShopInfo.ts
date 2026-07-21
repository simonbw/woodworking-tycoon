import { Vector } from "./Vectors";

export interface ShopInfo {
  name: string;
  electricity: 120 | 240;
  size: Vector;
  materialDropoffPosition: Vector;
  /** Where deliveries land: machine crates spawn on the nearest open floor. */
  entrancePosition: Vector;
}

/** The garage door sits at the bottom edge, middle of the wall. */
export function defaultEntrancePosition(size: Vector): Vector {
  return [Math.floor(size[0] / 2), size[1] - 1];
}
