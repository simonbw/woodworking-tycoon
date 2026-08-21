import { carryingShopVac, ShopVacCarry } from "./ShopVac";
import type { Vector } from "./Vectors";

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

/** What the held-tool questions actually read — a structural slice of
 * `GameState`, so snapshot holders pass the state itself and the sim
 * assembles the slice from the broom and vac entities (see
 * `cleaningGear` in sim/commands/cleaning-commands.ts). */
export interface CleaningGear extends ShopVacCarry {
  readonly broomOwned: boolean;
  readonly broomPosition: Vector | null;
}

export function holdingBroom(gear: CleaningGear): boolean {
  return gear.broomOwned && gear.broomPosition === null;
}

export function heldTool(gear: CleaningGear): HeldToolId | null {
  if (holdingBroom(gear)) {
    return "broom";
  }
  if (carryingShopVac(gear)) {
    return "vacHose";
  }
  return null;
}
