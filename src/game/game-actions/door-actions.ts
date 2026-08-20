import { ProgressionState } from "../GameState";
import { atTruckCab } from "../lot";
import { StoreId } from "../lumberStock";
import { Person } from "../Person";
import { ShopInfo } from "../ShopInfo";

/**
 * The rules that gate leaving the lot: where a trip may start, which
 * storefronts the player has heard of, and what a drive costs in shop
 * minutes. The trips themselves are `sim/commands/trip-commands.ts`.
 */

/**
 * Leaving the shop happens at the truck's cab: walk out to the driveway,
 * climb in, and pick a destination (the store, a scavenging run). One
 * trip at a time, and not with a machine over your shoulders.
 */
export interface LeaveShopFacts {
  readonly player: Pick<Person, "away" | "carriedMachine" | "position">;
  readonly shopInfo: ShopInfo;
}

export function canLeaveShop(facts: LeaveShopFacts): boolean {
  return (
    !facts.player.away &&
    !facts.player.carriedMachine &&
    atTruckCab(facts.shopInfo, facts.player.position)
  );
}

/** Whether the player has heard of this store yet. */
export function storeUnlocked(
  progression: Pick<ProgressionState, "storeUnlocked" | "lumberyardUnlocked">,
  store: StoreId,
): boolean {
  return store === "orangeBox"
    ? progression.storeUnlocked
    : progression.lumberyardUnlocked;
}

/**
 * What a drive out (or back) costs in shop minutes. Errands aren't free:
 * each leg of a store run charges this many ticks through the ordinary
 * pipeline, so a curing glue-up gains the same minutes the drive
 * spends. Scavenging carries its own, longer timer instead.
 */
export const DRIVE_TICKS_ONE_WAY = 15;
