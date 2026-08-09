import { Vector } from "./Vectors";

export interface ShopInfo {
  name: string;
  electricity: 120 | 240;
  size: Vector;
  materialDropoffPosition: Vector;
  /** The delivery cell just inside the garage door: where deliveries
   * land (machine crates spawn on the nearest open floor). The door's
   * own geometry is continuous — see `doorCenterX` / `DOOR_WIDTH`. */
  entrancePosition: Vector;
}

/** Width of the garage door opening, in cells — an 8-ft door. Even on
 * purpose: the default shop is an even number of cells wide, so only an
 * even-width door can sit dead-center on the bottom wall. */
export const DOOR_WIDTH = 8;

/** Continuous x of the garage door's center: the bottom wall's midline.
 * Every door consumer — walls, driveway, parked truck, light spill —
 * derives from this, so the opening can never drift off-center. */
export function doorCenterX(shopInfo: Pick<ShopInfo, "size">): number {
  return shopInfo.size[0] / 2;
}

/** The delivery cell sits at the bottom edge, middle of the wall. */
export function defaultEntrancePosition(size: Vector): Vector {
  return [Math.floor(size[0] / 2), size[1] - 1];
}
