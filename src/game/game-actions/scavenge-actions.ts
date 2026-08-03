import { GameAction } from "../GameState";
import { makeMaterial } from "../material-helpers";
import { MaterialInstance, Pallet } from "../Materials";
import { Tuple } from "../../utils/typeUtils";
import { canLeaveShop } from "./door-actions";

/** How long a scavenging trip takes — about a quarter of a 600-tick day. */
const FULL_SCAVENGE_DURATION_TICKS = 150;

/**
 * What a dev build shortens the drive to: a couple of seconds instead of
 * thirty, so working on anything downstream of a pallet doesn't mean
 * waiting out the travel log every time.
 */
export const DEV_SCAVENGE_DURATION_TICKS = 10;

/**
 * The trip length the shop actually runs at. Only the dev bundle shortens
 * it — esbuild defines NODE_ENV, so a production build and the test runners
 * (where it is unset) both keep the real quarter-day.
 */
export const SCAVENGE_DURATION_TICKS =
  process.env.NODE_ENV === "development"
    ? DEV_SCAVENGE_DURATION_TICKS
    : FULL_SCAVENGE_DURATION_TICKS;

/**
 * What a scavenging trip brings home: 1-2 pallets in randomly rough shape.
 * Takes the rng as a parameter so tests can make it deterministic.
 */
export function generateScavengeLoot(
  rng: () => number = Math.random,
): MaterialInstance[] {
  const palletCount = rng() < 0.5 ? 1 : 2;
  const pallets: MaterialInstance[] = [];
  for (let i = 0; i < palletCount; i++) {
    pallets.push(makeDamagedPallet(rng));
  }
  return pallets;
}

function makeDamagedPallet(rng: () => number): Pallet {
  // 6-11 of the 11 deck boards survived, in random spots
  const deckBoardCount = 6 + Math.floor(rng() * 6);
  const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const deckBoards = Array(11).fill(false) as boolean[];
  for (const position of positions.slice(0, deckBoardCount)) {
    deckBoards[position] = true;
  }

  return makeMaterial<Pallet>({
    type: "pallet",
    deckBoards: deckBoards as Tuple<boolean, 11>,
    // Usually all 3 stringers, sometimes one is cracked
    stringerBoardsLeft: rng() < 0.3 ? 2 : 3,
  });
}

/**
 * Drive out to hunt for free pallets. Starts at the truck's cab like any
 * trip out of the shop. The player is gone for SCAVENGE_DURATION_TICKS;
 * the haul is rolled up front and rides home in the truck's bed
 * (tickAction) when they get back.
 */
export function startScavengingAction(
  rng: () => number = Math.random,
): GameAction {
  return (gameState) => {
    if (!canLeaveShop(gameState)) {
      console.warn("Can't leave the shop right now");
      return gameState;
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        away: {
          kind: "scavenging",
          returnTick: gameState.tick + SCAVENGE_DURATION_TICKS,
          loot: generateScavengeLoot(rng),
        },
      },
    };
  };
}
