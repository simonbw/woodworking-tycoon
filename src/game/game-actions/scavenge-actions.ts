import { initialPalletNails } from "../bench-work/pallet-geometry";
import { GameState } from "../GameState";
import { makeMaterial } from "../material-helpers";
import { Pallet } from "../Materials";
import { ScavengeStopResult, ScavengingTrip } from "../Person";
import { Tuple } from "../../utils/typeUtils";
import { TICKS_PER_DAY } from "../time";
import { dayTicksSpent } from "../time-flow";

/**
 * The circuit, in driving order: every place in the neighborhood worth
 * checking for cast-off pallets. A trip works through these front to
 * back, one per search, and ends early whenever the player calls it.
 */
export const SCAVENGE_STOP_NAMES: ReadonlyArray<string> = [
  "Orange Box",
  "Grocery dock",
  "Tile warehouse",
  "Print shop",
  "Furniture factory",
];

/** Odds any one stop has a pallet worth taking. */
const FIND_CHANCE = 0.5;

/** Driving to the next spot and digging through it: half an hour. */
const FULL_STOP_TICKS = 30;

/**
 * What a dev build shortens a stop to: a couple of seconds instead of
 * six, so working on anything downstream of a pallet doesn't mean
 * waiting out the circuit every time.
 */
const DEV_STOP_TICKS = 10;

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * The leg length the shop actually runs at. Only the dev bundle shortens
 * it — esbuild defines NODE_ENV, so a production build and the test
 * runners (where it is unset) both keep the real half-hour.
 *
 * There is no matching drive home: calling it good enough drops the
 * player back at the shop for free (see headHomeFromScavengingAction) —
 * the circuit runs out from the shop and back, so the drive is already
 * paid for in each stop.
 */
export const SCAVENGE_STOP_TICKS = IS_DEV ? DEV_STOP_TICKS : FULL_STOP_TICKS;

/**
 * Roll the whole circuit's results up front. Invisible to the player —
 * a stop's result is only revealed when the search there finishes — but
 * it keeps the rng injectable at the trip's one entry point, so tests
 * stay deterministic. Roll order per stop: the find roll, then (on a
 * find) the deck boards and the stringers.
 *
 * The circuit always turns up at least one pallet: an all-empty trip
 * would strand a brand-new shop with no wood and no way to get any (the
 * first sale starts from a scavenged pallet), so a washed-out roll
 * plants a find at one stop.
 *
 * That backstop isn't enough for the very first trip, though: only
 * searched stops pay out, so a plant at stop four does nothing for a
 * player who calls it after stop one. While the shop has never had a
 * pallet (needsFirstPallet — the same condition the to-do card's
 * scavenge step reads), `guaranteeFirstStop` moves the plant to the
 * first stop, so the trip the card points at delivers no matter when
 * the player heads home. The extra pallet roll comes after the circuit's
 * own, so a scripted rng tape reads the same either way.
 */
export function rollScavengeStops(
  rng: () => number = Math.random,
  guaranteeFirstStop = false,
): ScavengeStopResult[] {
  const stops: ScavengeStopResult[] = SCAVENGE_STOP_NAMES.map((stopName) => ({
    stopName,
    pallet: rng() < FIND_CHANCE ? makeDamagedPallet(rng) : null,
  }));
  if (guaranteeFirstStop && stops[0].pallet === null) {
    stops[0] = {
      ...stops[0],
      pallet: makeDamagedPallet(rng),
    };
  } else if (stops.every((stop) => stop.pallet === null)) {
    const index = Math.min(stops.length - 1, Math.floor(rng() * stops.length));
    stops[index] = {
      ...stops[index],
      pallet: makeDamagedPallet(rng),
    };
  }
  return stops;
}

function makeDamagedPallet(rng: () => number): Pallet {
  // 5-8 of the 8 deck boards survived, in random spots
  const deckBoardCount = 5 + Math.floor(rng() * 4);
  const positions = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const deckBoards = Array(8).fill(false) as boolean[];
  for (const position of positions.slice(0, deckBoardCount)) {
    deckBoards[position] = true;
  }

  // Usually all 3 stringers, sometimes the bottom one is cracked off
  const stringers: Tuple<boolean, 3> =
    rng() < 0.3 ? [true, true, false] : [true, true, true];
  return makeMaterial<Pallet>({
    type: "pallet",
    deckBoards: deckBoards as Tuple<boolean, 8>,
    stringers,
    // A weathered pallet still holds a nail at every crossing that has
    // wood on both sides — missing boards took theirs with them
    nails: initialPalletNails(deckBoards, stringers),
  });
}

/** Everything the trip has loaded so far — what the bed gets on return. */
export function scavengeLoot(trip: ScavengingTrip): ReadonlyArray<Pallet> {
  return trip.stops
    .slice(0, trip.stopsSearched)
    .flatMap((stop) => (stop.pallet ? [stop.pallet] : []));
}

/**
 * Why "keep searching" is off the table right now, or null when it's on:
 * the trip isn't sitting at a decision, the circuit is used up, or the
 * next search wouldn't fit before the 5 PM close.
 */
export type KeepScavengingBlock =
  "notDeciding" | "outOfStops" | "outOfDaylight";

export function keepScavengingBlock(
  gameState: GameState,
): KeepScavengingBlock | null {
  const away = gameState.player.away;
  if (away?.kind !== "scavenging" || away.phase.kind !== "deciding") {
    return "notDeciding";
  }
  if (away.stopsSearched >= away.stops.length) {
    return "outOfStops";
  }
  if (dayTicksSpent(gameState) + SCAVENGE_STOP_TICKS > TICKS_PER_DAY) {
    return "outOfDaylight";
  }
  return null;
}
