import { GameAction, GameState } from "../GameState";
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

/**
 * Walk out the door to the store. The player is away for as long as they
 * browse — the shop keeps ticking without them (see Person.ShoppingTrip) —
 * and comes home via returnFromStoreAction.
 */
export function goToStoreAction(): GameAction {
  return (gameState) => {
    if (!gameState.progression.storeUnlocked) {
      console.warn("The store is not unlocked yet");
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
        away: { kind: "shopping" },
      },
    };
  };
}

/** Head home from the store. The player walks back in through the door. */
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
