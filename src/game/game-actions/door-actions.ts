import { GameAction, GameState } from "../GameState";
import { StoreId } from "../lumberStock";
import { isAtShopDoor } from "../ShopInfo";

/**
 * Leaving the shop happens at the garage door: walk up to it and pick a
 * destination (the store, a scavenging run). One trip at a time, and not
 * with a machine over your shoulders.
 */
export function canLeaveShop(gameState: GameState): boolean {
  return (
    !gameState.player.away &&
    !gameState.player.carriedMachine &&
    isAtShopDoor(gameState.shopInfo, gameState.player.position)
  );
}

/** Whether the player has heard of this store yet. */
export function storeUnlocked(gameState: GameState, store: StoreId): boolean {
  return store === "orangeBox"
    ? gameState.progression.storeUnlocked
    : gameState.progression.lumberyardUnlocked;
}

/**
 * Walk out the door to a store. The player is away for as long as they
 * browse — the shop keeps ticking without them (see Person.ShoppingTrip) —
 * and comes home via returnFromStoreAction.
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
        canWork: false,
        workQueue: [],
        away: { kind: "shopping", store },
      },
    };
  };
}

/** Head home from a store. The player walks back in through the door. */
export function returnFromStoreAction(): GameAction {
  return (gameState) => {
    if (gameState.player.away?.kind !== "shopping") {
      console.warn("Player is not out shopping");
      return gameState;
    }
    return {
      ...gameState,
      player: { ...gameState.player, away: null, canWork: true },
    };
  };
}
