import { dustTotal, SpeciesAmounts } from "./Dust";
import type { GameState } from "./GameState";
import { Vector } from "./Vectors";

/**
 * The shop vac: a canister on wheels the player drags around (see
 * docs/dust-and-cleaning.md). It's the tool that cleans to zero — the
 * broom always leaves a film, and only the vac reaches under machines
 * properly. The cost is hauling it: dragging slows every step, and the
 * canister needs emptying at the garbage can.
 */
export interface ShopVacState {
  /** Where it's parked; null while the player is dragging it. */
  readonly position: Vector | null;
  /** Dust in the canister, by species. */
  readonly canister: SpeciesAmounts;
}

export const SHOP_VAC_COST = 350;
/** ~5 full cells' worth before a trip to the garbage. */
export const SHOP_VAC_CANISTER_CAPACITY = 500;
/** Dragging it over dust cleans a trickle underfoot, every tick. */
export const SHOP_VAC_PASSIVE_RATE = 6;
/** Dragging the canister costs an extra tick per step. */
export const SHOP_VAC_DRAG_PENALTY = 1;
/** An active vacuum burst occupies this many ticks (1 now + rest busy). */
export const VACUUM_TICKS = 2;

export function carryingShopVac(gameState: GameState): boolean {
  return gameState.shopVac !== null && gameState.shopVac.position === null;
}

export function canisterRoom(vac: ShopVacState): number {
  return Math.max(0, SHOP_VAC_CANISTER_CAPACITY - dustTotal(vac.canister));
}

export function canisterFillFraction(vac: ShopVacState): number {
  return Math.min(1, dustTotal(vac.canister) / SHOP_VAC_CANISTER_CAPACITY);
}
