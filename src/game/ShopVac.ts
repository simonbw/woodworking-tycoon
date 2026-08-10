import { dustTotal, SpeciesAmounts } from "./Dust";
import type { GameState } from "./GameState";
import { Vector } from "./Vectors";

/**
 * The shop vac: a canister on wheels the player drags around by its
 * hose (see docs/dust-and-cleaning.md). Grabbing it is holding the hose
 * — a held tool, so it commits the hands and the Space hold runs the
 * suction (vacuumTickPass). It's the tool that cleans to zero — the
 * broom always leaves a film, and only the vac reaches under machines
 * properly. The cost is hauling it: dragging slows every step, and the
 * canister has to be deliberately emptied at the garbage can.
 */
export interface ShopVacState {
  /** Where it's parked; null while the player is dragging it. */
  readonly position: Vector | null;
  /** Dust in the canister, by species. */
  readonly canister: SpeciesAmounts;
}

export const SHOP_VAC_COST = 350;
/** What it's called on the shelf tag, and on the cart's receipt. */
export const SHOP_VAC_NAME = "Shop Vac";
/** Dozens of cells filled to DUST_MAX_PER_CELL before a trip to the garbage. */
export const SHOP_VAC_CANISTER_CAPACITY = 500;
/** Dragging it over dust cleans a trickle underfoot, every tick. */
export const SHOP_VAC_PASSIVE_RATE = 6;
/** Dragging the canister costs an extra tick per step. */
export const SHOP_VAC_DRAG_PENALTY = 1;
/** Units drained per tick while holding the empty at the garbage can —
 * a full canister is a real pour, not a blink. */
export const SHOP_VAC_EMPTY_RATE = 30;

export function carryingShopVac(gameState: GameState): boolean {
  return gameState.shopVac !== null && gameState.shopVac.position === null;
}

export function canisterRoom(vac: ShopVacState): number {
  return Math.max(0, SHOP_VAC_CANISTER_CAPACITY - dustTotal(vac.canister));
}

export function canisterFillFraction(vac: ShopVacState): number {
  return Math.min(1, dustTotal(vac.canister) / SHOP_VAC_CANISTER_CAPACITY);
}
