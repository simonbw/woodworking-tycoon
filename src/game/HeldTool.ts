import type { GameState } from "./GameState";
import { carryingShopVac } from "./ShopVac";

/**
 * Handheld tools the player works by holding the operate key — the same
 * hold that pushes stock through a machine, aimed at the tool in hand
 * instead (see docs/dust-and-cleaning.md). Holding one commits the
 * hands: no picking up stock until it's set down, and Space belongs to
 * the tool rather than the machine underfoot.
 *
 * Derived, never stored: each tool records where it's resting (the
 * broom's floor cell, the vac's parked position) and "in hand" is that
 * position being null — the same convention the vac established, so
 * there's no second flag to drift out of sync.
 */
export type HeldToolId = "broom" | "vacHose";

/** What the store charges for the shop broom (dustpan included). */
export const BROOM_COST = 15;

/** What it's called on the shelf tag, and on the cart's receipt. */
export const BROOM_NAME = "Shop Broom";

export function holdingBroom(gameState: GameState): boolean {
  return gameState.broomOwned && gameState.broomPosition === null;
}

export function heldTool(gameState: GameState): HeldToolId | null {
  if (holdingBroom(gameState)) {
    return "broom";
  }
  if (carryingShopVac(gameState)) {
    return "vacHose";
  }
  return null;
}
