import { GameAction, GameState } from "../GameState";
import { atTruckCab, truckCabSideCell } from "../lot";
import { StoreId } from "../lumberStock";
import { NIGHT_TICKS } from "../time";
import { isNight } from "../time-flow";
import { tickAction } from "./tickAction";

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
 * each leg of a store run — or of a delivery run, which is the same
 * drive with the bed loaded — charges this many ticks through the
 * ordinary pipeline, so a curing glue-up gains the same minutes the
 * drive spends. Scavenging carries its own, longer timer instead.
 */
export const DRIVE_TICKS_ONE_WAY = 15;

/**
 * The drive itself: a batch of ordinary ticks, run while `away` is set.
 * Exported for delivery-actions.ts, whose run is the same two legs.
 */
export function driveTicks(
  gameState: GameState,
  rng: () => number = Math.random,
): GameState {
  for (let i = 0; i < DRIVE_TICKS_ONE_WAY; i++) {
    gameState = tickAction(gameState, rng);
  }
  return gameState;
}

/**
 * Drive out to a store. The drive there charges its minutes up front;
 * after that the player is away for as long as they browse — the aisles
 * are thinking time, nearly free — and comes home via
 * returnFromStoreAction, which charges the drive back.
 */
export function goToStoreAction(
  store: StoreId,
  rng: () => number = Math.random,
): GameAction {
  return (gameState) => {
    if (!storeUnlocked(gameState, store)) {
      console.warn("That store is not unlocked yet");
      return gameState;
    }
    if (!canLeaveShop(gameState)) {
      console.warn("Can't leave the shop right now");
      return gameState;
    }
    if (isNight(gameState)) {
      console.warn("Shop's closed for the night — nowhere to go but home");
      return gameState;
    }
    return driveTicks(
      {
        ...gameState,
        player: {
          ...gameState.player,
          away: { kind: "shopping", store },
        },
      },
      rng,
    );
  };
}

/**
 * Head home from a store. The drive back charges its minutes, then the
 * truck pulls in and the player steps out beside the cab, purchases
 * riding in the bed.
 */
export function returnFromStoreAction(
  rng: () => number = Math.random,
): GameAction {
  return (gameState) => {
    if (gameState.player.away?.kind !== "shopping") {
      console.warn("Player is not out shopping");
      return gameState;
    }
    gameState = driveTicks(gameState, rng);
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

/**
 * Call it a day: drive home for the night. The day ends here — the
 * overnight itself runs when the morning comes, in wakeUpAction. Always
 * on offer; sleeping early just leaves the rest of the day unspent.
 */
export function goHomeAction(): GameAction {
  return (gameState) => {
    if (!canLeaveShop(gameState)) {
      console.warn("Can't leave the shop right now");
      return gameState;
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        away: { kind: "home" },
      },
    };
  };
}

/**
 * Morning. The whole overnight is a batch of ordinary ticks run through
 * the ordinary tick pipeline — glue cures finish, listings roll their
 * sales, demand recovers, and the job board rotates for the new day —
 * then the truck pulls back in and a fresh budget of working minutes
 * starts. Attended work holds where it was left (the player is away for
 * every overnight tick), same as stepping away from a cut does.
 */
export function wakeUpAction(rng: () => number = Math.random): GameAction {
  return (gameState) => {
    if (gameState.player.away?.kind !== "home") {
      console.warn("Player is not home in bed");
      return gameState;
    }
    // The day turns over before the night runs, so the first overnight
    // tick is the one that rotates the job board (see refreshJobBoard).
    gameState = { ...gameState, day: gameState.day + 1 };
    for (let i = 0; i < NIGHT_TICKS; i++) {
      gameState = tickAction(gameState, rng);
    }
    return {
      ...gameState,
      dayStartTick: gameState.tick,
      player: {
        ...gameState.player,
        away: null,
        position: truckCabSideCell(gameState.shopInfo),
      },
    };
  };
}
