import { GameState } from "../GameState";
import { atTruckCab } from "../lot";
import { StoreId } from "../lumberStock";

/**
 * Leaving the shop happens at the truck's cab: walk out to the driveway,
 * climb in, and pick a destination (the store, a scavenging run). One
 * trip at a time, and not with a machine over your shoulders.
 */
export function canLeaveShop(gameState: GameState): boolean {
  return (
    !gameState.player.away &&
    !gameState.player.carriedMachine &&
    atTruckCab(gameState.shopInfo, gameState.player.position)
  );
}

/** Whether the player has heard of this store yet. */
export function storeUnlocked(gameState: GameState, store: StoreId): boolean {
  return store === "orangeBox"
    ? gameState.progression.storeUnlocked
    : gameState.progression.lumberyardUnlocked;
}

/**
 * What a drive out (or back) costs in shop minutes. Errands aren't free:
 * each leg of a store run charges this many ticks through the ordinary
 * pipeline, so a curing glue-up gains the same minutes the drive
 * spends. Scavenging carries its own, longer timer instead.
 */
export const DRIVE_TICKS_ONE_WAY = 15;
