import type { GameState } from "./GameState";
import { carryingShopVac } from "./ShopVac";
import { Vector } from "./Vectors";

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

/** Where the broom starts: leaning in the shop's top-left corner. */
export const BROOM_HOME: Vector = [0, 0];

export function holdingBroom(gameState: GameState): boolean {
  return gameState.broomPosition === null;
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
