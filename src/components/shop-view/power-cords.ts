import { footprintCenter, Machine } from "../../game/Machine";
import { doorCenterX, DOOR_WIDTH, ShopInfo } from "../../game/ShopInfo";
import { localToGlobal, Vector } from "../../game/Vectors";

/**
 * Where the wall outlets sit and which one each machine's cord runs to.
 * Pure geometry in cell units so PowerCordLayer stays a thin draw pass —
 * everything here is cosmetic; no game rule reads it.
 */

export type WallSide = "top" | "bottom" | "left" | "right";

export interface Outlet {
  /** Point on the wall's interior face, in cell units. */
  readonly position: Vector;
  /** Which wall it's mounted on — the plate and plug draw outward from it. */
  readonly side: WallSide;
}

/**
 * Roughly one outlet every 5 ft of solid wall. Whoever wired this garage
 * expected power tools.
 */
const OUTLET_SPACING = 5;

/** A stretch of wall shorter than this goes without a receptacle — just
 * enough to rule out slivers while keeping the 1.5-ft stretches beside
 * the 8-ft garage door powered. */
const MIN_SEGMENT = 1;

/**
 * Evenly spaced outlet spots within one unbroken stretch of wall — as
 * many spans as fit, one spot centered in each. Anchoring to the segment
 * rather than the corner keeps the short stretches beside the garage door
 * powered instead of losing their spots to the opening.
 */
function spotsAlong(start: number, end: number): number[] {
  const length = end - start;
  if (length < MIN_SEGMENT) {
    return [];
  }
  const count = Math.max(1, Math.floor(length / OUTLET_SPACING));
  const spots: number[] = [];
  for (let i = 0; i < count; i++) {
    spots.push(start + ((i + 0.5) * length) / count);
  }
  return spots;
}

/** Every outlet in the shop. Deterministic in the shop's dimensions. */
export function outletPositions(shopInfo: ShopInfo): Outlet[] {
  const [width, height] = shopInfo.size;
  const outlets: Outlet[] = [];
  for (const t of spotsAlong(0, width)) {
    outlets.push({ position: [t, 0], side: "top" });
  }
  for (const t of spotsAlong(0, height)) {
    outlets.push({ position: [0, t], side: "left" });
    outlets.push({ position: [width, t], side: "right" });
  }
  // The bottom wall is two solid segments flanking the door opening —
  // the strip plus half a cell of jamb on each side stays clear.
  const doorCenter = doorCenterX(shopInfo);
  const doorHalfSpan = DOOR_WIDTH / 2 + 0.5;
  for (const t of [
    ...spotsAlong(0, doorCenter - doorHalfSpan),
    ...spotsAlong(doorCenter + doorHalfSpan, width),
  ]) {
    outlets.push({ position: [t, height], side: "bottom" });
  }
  return outlets;
}

/** The outlet a cord from `point` (cell units) runs to. */
export function nearestOutlet(point: Vector, shopInfo: ShopInfo): Outlet {
  const outlets = outletPositions(shopInfo);
  let best = outlets[0];
  let bestDistSq = Infinity;
  for (const outlet of outlets) {
    const dx = outlet.position[0] - point[0];
    const dy = outlet.position[1] - point[1];
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      best = outlet;
      bestDistSq = distSq;
    }
  }
  return best;
}

/**
 * Where a machine's cord leaves it: the center of its footprint, in
 * fractional cell units (cell [0, 0]'s center is [0.5, 0.5]). The cord
 * runs under the machine's art, so "somewhere inside the silhouette" is
 * all this needs to be.
 */
export function cordAnchor(machine: Machine): Vector {
  const local = footprintCenter(machine.type.cellsOccupied);
  const [x, y] = localToGlobal(machine.position, local, machine.rotation);
  return [x + 0.5, y + 0.5];
}

/**
 * Deterministic per-cord slack in [-1, 1], keyed by the machine's identity
 * — each cord holds its own drape across renders but re-drapes when the
 * machine is carried somewhere new (same FNV-style trick as the lawn's
 * hash2).
 */
export function cordSlack(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
