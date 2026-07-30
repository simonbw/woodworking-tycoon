import { GameAction, GameState } from "../GameState";
import { atTruckCab, truckCabSideCell } from "../lot";
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
 * Drive out to a store. The player is away for as long as they browse —
 * the shop keeps ticking without them (see Person.ShoppingTrip) — and
 * comes home via returnFromStoreAction.
 */
export function goToStoreAction(store: StoreId): GameAction {
  return (gameState) => {
    if (!storeUnlocked(gameState, store)) {
      console.warn("That store is not unlocked yet");
      return gameState;
    }
    if (!canLeaveShop(gameState)) {
      console.warn("Can't leave the shop right now");
      return gameState;
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        away: { kind: "shopping", store },
      },
    };
  };
}

/**
 * Head home from a store. The truck pulls back in and the player steps
 * out beside the cab, purchases riding in the bed.
 */
export function returnFromStoreAction(): GameAction {
  return (gameState) => {
    if (gameState.player.away?.kind !== "shopping") {
      console.warn("Player is not out shopping");
      return gameState;
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        away: null,
        position: truckCabSideCell(gameState.shopInfo),
      },
    };
  };
}
