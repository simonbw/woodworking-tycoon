import { SolidBox } from "./player-motion";
import { DOOR_HALF_WIDTH, ShopInfo } from "./ShopInfo";
import { Vector } from "./Vectors";

/**
 * The lot the garage sits on, as the simulation sees it: the walkable
 * world extends past the garage door down the driveway, around the
 * parked truck, and a little beyond its nose. Only the building's floor
 * has cells (CellMap) — the lot is walkable ground with nothing to
 * place, pick up, or operate, which is exactly why placement stays
 * inside for free: an outdoor cell has no CellMap entry.
 *
 * All geometry here is in continuous cell coordinates (one cell = one
 * foot) and derived from ShopInfo, so the render side (EnvironmentLayer,
 * TruckSprite) and the collision side can never disagree about where a
 * wall or the tailgate is.
 */

/** Stud wall thickness in cells — the collision twin of the 6" band
 * EnvironmentLayer draws around the slab. */
export const WALL_THICKNESS_CELLS = 0.5;

/**
 * The truck parked in the driveway — a '96 Ranger: 66" across the body,
 * 202" bumper to bumper (see TruckSprite for how the art maps onto this
 * footprint). Backed in, tailgate to the garage, so loading the bed is a
 * step out the door and the cab is a walk down the driveway.
 */
export const TRUCK_BODY_WIDTH = 66 / 12;
export const TRUCK_LENGTH = 202 / 12;

/**
 * Gap between the outer wall face and the tailgate, in cells. Two cells
 * on purpose: the truck's body is wider than the corner clearances the
 * 7-ft door leaves, so this strip is the only way from the door to the
 * grass beside the truck — and a 2-cell gap is exactly what counts as a
 * walkable aisle between machines (see PLAYER_RADIUS).
 */
export const TRUCK_PARK_GAP = 2;

/** Grass kept walkable past the truck's nose, so the player can round
 * the front bumper instead of dead-ending on the world edge. */
const LOT_MARGIN_BELOW_TRUCK = 3;

/** The parked truck's body footprint (no mirrors), centered on the
 * driveway, tailgate toward the door. */
export function truckParkedRect(shopInfo: ShopInfo): {
  min: Vector;
  max: Vector;
} {
  const centerX = shopInfo.entrancePosition[0] + 0.5;
  const tailgateY = shopInfo.size[1] + WALL_THICKNESS_CELLS + TRUCK_PARK_GAP;
  return {
    min: [centerX - TRUCK_BODY_WIDTH / 2, tailgateY],
    max: [centerX + TRUCK_BODY_WIDTH / 2, tailgateY + TRUCK_LENGTH],
  };
}

/** The parked truck as a solid the walking body collides with. */
export function truckSolid(shopInfo: ShopInfo): SolidBox {
  const { min, max } = truckParkedRect(shopInfo);
  return { kind: "box", min, max };
}

/**
 * The walkable world's size in cells: the shop's width (the grass strips
 * beside the driveway are part of it — the driveway alone is too narrow
 * to walk around the truck), extended down past the truck's nose.
 */
export function lotSize(shopInfo: ShopInfo): Vector {
  return [
    shopInfo.size[0],
    Math.ceil(truckParkedRect(shopInfo).max[1] + LOT_MARGIN_BELOW_TRUCK),
  ];
}

/** Whether a cell lies outside the building. Outdoor cells have no
 * CellMap entry — nothing is placed, dropped, or operated out here. */
export function isOutdoors(shopInfo: ShopInfo, position: Vector): boolean {
  return position[1] >= shopInfo.size[1];
}

/**
 * The building's walls as solids: full bands on three sides, the bottom
 * band split by the garage-door opening. The world clamp (lotSize) only
 * bounds the lot's outer edges — these are what keep the body indoors
 * everywhere but the door.
 */
export function wallSolids(shopInfo: ShopInfo): SolidBox[] {
  const [w, h] = shopInfo.size;
  const t = WALL_THICKNESS_CELLS;
  const doorLeft = shopInfo.entrancePosition[0] - DOOR_HALF_WIDTH;
  const doorRight = shopInfo.entrancePosition[0] + DOOR_HALF_WIDTH + 1;
  const box = (min: Vector, max: Vector): SolidBox => ({
    kind: "box",
    min,
    max,
  });
  return [
    box([-t, -t], [w + t, 0]),
    box([-t, -t], [0, h + t]),
    box([w, -t], [w + t, h + t]),
    box([-t, h], [doorLeft, h + t]),
    box([doorRight, h], [w + t, h + t]),
  ];
}
