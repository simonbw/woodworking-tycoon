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

/**
 * Whether a cell counts as "at the garage door" — the entrance cell or any
 * cell touching it. Standing here surfaces the places you can walk out to
 * (the door panel, and the door verbs on the action bar).
 */
export function isAtShopDoor(shopInfo: ShopInfo, position: Vector): boolean {
  const [ex, ey] = shopInfo.entrancePosition;
  return Math.abs(position[0] - ex) <= 1 && Math.abs(position[1] - ey) <= 1;
}
