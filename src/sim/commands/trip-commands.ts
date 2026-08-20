import { Game } from "../../core/Game";
import {
  canLeaveShop,
  DRIVE_TICKS_ONE_WAY,
  storeUnlocked,
} from "../../game/game-actions/door-actions";
import {
  keepScavengingBlock,
  rollScavengeStops,
  scavengeLoot,
  SCAVENGE_STOP_NAMES,
  SCAVENGE_STOP_TICKS,
} from "../../game/scavenge";
import { truckCabSideCell } from "../../game/lot";
import { StoreId } from "../../game/lumberStock";
import { ScavengingTrip } from "../../game/Person";
import { cellCenter } from "../../game/player-motion";
import { storeLayout } from "../../game/store-layout";
import { isNight } from "../../game/time-flow";
import { needsFirstPallet } from "../../game/tutorial";
import { Direction, Vector } from "../../game/Vectors";
import { Player } from "../entities/Player";
import { TruckEntity } from "../entities/TruckEntity";
import { ShopInfo } from "../singletons/ShopInfo";
import { projectGameState } from "../projection";

/**
 * The trip command surface: leaving the shop through the truck's cab, on
 * a scavenging circuit or a store run. Going home for the night belongs
 * to the day-cycle commands. Each command validates through the pure
 * rules in `game/scavenge.ts` and `game/game-actions/door-actions.ts`
 * over a projection snapshot, then writes onto the entities; a refusal
 * logs and returns false.
 *
 * How the legs charge their minutes differs by trip:
 *
 *  - A scavenging search carries its own timer (`doneTick`), and the
 *    half-hour is spent through the live pace model — the Player entity
 *    registers a TimeFlow spender for `searching`, so the clock runs at
 *    working pace until the stop's reveal (which the Player's own tick
 *    performs). Heading home is free.
 *  - A store run charges DRIVE_TICKS_ONE_WAY minutes per leg. Commands
 *    never advance the sim, so the caller drives those ticks through
 *    TimeFlow — the driver's goShopping/comeHome tick them around these
 *    commands, and the store venue forces them the same way. `goToStore`
 *    is called before its leg (the drive out runs with the trip
 *    underway) and `returnFromStore` after its leg (the drive home runs
 *    before the player steps out).
 */

// The trip constants, re-exported so the driver reads them through the
// command surface rather than reaching into the rule modules.
export { DRIVE_TICKS_ONE_WAY, SCAVENGE_STOP_NAMES, SCAVENGE_STOP_TICKS };

// The leaving guard, re-exported the same way for the shell's trip card
// and the dispatcher.
export { canLeaveShop };

// The scavenging trip's pure reads, re-exported for the trip overlay
// (the same seam): why another search is refused, what the circuit has
// in the truck so far, and the roll that lays the circuit out.
export { keepScavengingBlock, rollScavengeStops, scavengeLoot };

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/** Where the player lands stepping out of the truck after any trip. */
function stepOutAtCab(game: Game): void {
  const shopInfo = game.entities.getSingleton(ShopInfo);
  player(game).position = cellCenter(truckCabSideCell(shopInfo.info));
}

// ---------------------------------------------------------------------
// Scavenging: the stop-by-stop circuit
// ---------------------------------------------------------------------

/**
 * Drive out to hunt for free pallets. Starts at the truck's cab like any
 * trip out of the shop, and heads straight into the first stop's search;
 * from there the trip runs on the player's calls (keep searching / head
 * home) until the drive home lands the haul in the truck's bed. The
 * circuit's finds roll from `game.random` (the old action's injected
 * rng), so a seeded game lands the same pallets every run.
 */
export function startScavenging(
  game: Game,
  rng: () => number = game.random,
): boolean {
  const gameState = projectGameState(game);
  if (!canLeaveShop(gameState)) {
    console.warn("Can't leave the shop right now");
    return false;
  }
  if (isNight(gameState)) {
    console.warn("Shop's closed for the night — nowhere to go but home");
    return false;
  }
  player(game).away = {
    kind: "scavenging",
    startTick: gameState.tick,
    stops: rollScavengeStops(rng, needsFirstPallet(gameState)),
    stopsSearched: 0,
    phase: {
      kind: "searching",
      doneTick: gameState.tick + SCAVENGE_STOP_TICKS,
    },
  };
  game.dispatch("playerChanged", {});
  return true;
}

/**
 * Push on to the next stop — another half hour spent. Refused (with a
 * console note, mirroring the other guarded verbs) when
 * keepScavengingBlock says why; the UI shows the same reason on the
 * disabled button.
 */
export function continueScavenging(game: Game): boolean {
  const gameState = projectGameState(game);
  const block = keepScavengingBlock(gameState);
  if (block !== null) {
    console.warn(`Can't keep scavenging: ${block}`);
    return false;
  }
  const thePlayer = player(game);
  const away = thePlayer.away as ScavengingTrip;
  thePlayer.away = {
    ...away,
    phase: {
      kind: "searching",
      doneTick: gameState.tick + SCAVENGE_STOP_TICKS,
    },
  };
  game.dispatch("playerChanged", {});
  return true;
}

/**
 * Call it and pull back into the shop — always on offer at a decision,
 * day or night (driving back after close is allowed; starting another
 * search is not), and free: the circuit loops back past the shop, so the
 * drive is already paid for in the stops. The haul lands in the truck's
 * bed to be unloaded at the tailgate, and the player steps out beside
 * the cab — the same arrival a shopping trip ends with.
 */
export function headHomeFromScavenging(game: Game): boolean {
  const thePlayer = player(game);
  const away = thePlayer.away;
  if (away?.kind !== "scavenging" || away.phase.kind !== "deciding") {
    console.warn("Not at a scavenging decision — nothing to call");
    return false;
  }
  game.entities.getSingleton(TruckEntity).bed.push(...scavengeLoot(away));
  thePlayer.away = null;
  stepOutAtCab(game);
  game.dispatch("truckChanged", {});
  game.dispatch("playerChanged", {});
  return true;
}

// ---------------------------------------------------------------------
// Store runs: out through the cab, home past the register
// ---------------------------------------------------------------------

/**
 * Drive out to a store. The caller charges the drive's
 * DRIVE_TICKS_ONE_WAY minutes right after this (see the header); after
 * that the player is away for as long as they browse — the aisles are
 * thinking time, nearly free — and comes home via `returnFromStore`.
 */
export function goToStore(game: Game, store: StoreId): boolean {
  const gameState = projectGameState(game);
  if (!storeUnlocked(gameState, store)) {
    console.warn("That store is not unlocked yet");
    return false;
  }
  if (!canLeaveShop(gameState)) {
    console.warn("Can't leave the shop right now");
    return false;
  }
  if (isNight(gameState)) {
    console.warn("Shop's closed for the night — nowhere to go but home");
    return false;
  }
  // The trip arrives beside the truck's cab in the store's lot, the
  // mirror of stepping out beside it back home.
  const spawn = storeLayout(store, gameState).spawn;
  player(game).away = {
    kind: "shopping",
    store,
    cart: [],
    hasCart: false,
    position: spawn.cell,
    direction: spawn.direction,
  };
  game.dispatch("playerChanged", {});
  return true;
}

/**
 * Bookkeeping for the store floor's walk: the shopper's cell and facing,
 * written by the store view the way the shop floor's body writes the
 * player's. No-op off a shopping trip. Deliberately announces nothing:
 * this is the body's continuous motion, not a discrete mutation (see
 * CustomEvent.ts).
 */
export function setShoppingPosition(
  game: Game,
  position: Vector,
  direction: Direction,
): boolean {
  const thePlayer = player(game);
  if (thePlayer.away?.kind !== "shopping") {
    return false;
  }
  thePlayer.away = { ...thePlayer.away, position, direction };
  return true;
}

/**
 * Head home from a store: the truck pulls in and the player steps out
 * beside the cab, purchases riding in the bed. The caller charges the
 * drive's DRIVE_TICKS_ONE_WAY minutes right before this (see the
 * header), so the trip is still underway while they pass.
 */
export function returnFromStore(game: Game): boolean {
  const thePlayer = player(game);
  if (thePlayer.away?.kind !== "shopping") {
    console.warn("Player is not out shopping");
    return false;
  }
  thePlayer.away = null;
  stepOutAtCab(game);
  game.dispatch("playerChanged", {});
  return true;
}
