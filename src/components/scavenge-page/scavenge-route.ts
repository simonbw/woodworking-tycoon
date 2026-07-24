import { Pallet } from "../../game/Materials";
import { ScavengingTrip } from "../../game/Person";
import { seededRandom } from "../../utils/randUtils";

/** A point on the neighborhood map, in SVG user units (see MAP_WIDTH/HEIGHT). */
export type MapPoint = { readonly x: number; readonly y: number };

export const MAP_WIDTH = 480;
export const MAP_HEIGHT = 320;

/**
 * The scavenging circuit: a loop from the shop past every likely pallet
 * spot in the neighborhood and back. Both the travel log and the map's
 * dotted line key off fractions of this loop's length, so a log entry
 * appears just as the line reaches its stop.
 */
export const ROUTE_WAYPOINTS: readonly MapPoint[] = [
  { x: 60, y: 272 }, // the shop
  { x: 128, y: 258 },
  { x: 170, y: 232 }, // Orange Box
  { x: 232, y: 244 },
  { x: 300, y: 230 }, // grocery dock
  { x: 368, y: 208 },
  { x: 410, y: 150 }, // tile warehouse
  { x: 380, y: 96 },
  { x: 300, y: 70 }, // print shop
  { x: 210, y: 84 },
  { x: 130, y: 64 }, // furniture factory
  { x: 74, y: 110 },
  { x: 58, y: 180 },
  { x: 60, y: 272 }, // back home
];

const STOPS_ON_ROUTE: ReadonlyArray<{ name: string; waypoint: number }> = [
  { name: "Orange Box", waypoint: 2 },
  { name: "Grocery dock", waypoint: 4 },
  { name: "Tile warehouse", waypoint: 6 },
  { name: "Print shop", waypoint: 8 },
  { name: "Furniture factory", waypoint: 10 },
];

function distance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const CUMULATIVE_LENGTHS = ROUTE_WAYPOINTS.map((_, i) =>
  ROUTE_WAYPOINTS.slice(0, i).reduce(
    (sum, point, j) => sum + distance(point, ROUTE_WAYPOINTS[j + 1]),
    0,
  ),
);
const ROUTE_LENGTH = CUMULATIVE_LENGTHS[CUMULATIVE_LENGTHS.length - 1];

export type ScavengeStop = {
  readonly name: string;
  readonly point: MapPoint;
  /** Fraction of the trip at which the route reaches this stop. */
  readonly at: number;
};

export const SCAVENGE_STOPS: readonly ScavengeStop[] = STOPS_ON_ROUTE.map(
  ({ name, waypoint }) => ({
    name,
    point: ROUTE_WAYPOINTS[waypoint],
    at: CUMULATIVE_LENGTHS[waypoint] / ROUTE_LENGTH,
  }),
);

/** When the log notes the turn for home — just past the last stop. */
export const HEADING_HOME_AT =
  SCAVENGE_STOPS[SCAVENGE_STOPS.length - 1].at + 0.06;

/** Where the player is on the map at the given trip fraction. */
export function pointAtProgress(progress: number): MapPoint {
  const target = Math.min(1, Math.max(0, progress)) * ROUTE_LENGTH;
  for (let i = 1; i < ROUTE_WAYPOINTS.length; i++) {
    if (CUMULATIVE_LENGTHS[i] >= target) {
      const a = ROUTE_WAYPOINTS[i - 1];
      const b = ROUTE_WAYPOINTS[i];
      const segment = CUMULATIVE_LENGTHS[i] - CUMULATIVE_LENGTHS[i - 1];
      const t =
        segment === 0 ? 0 : (target - CUMULATIVE_LENGTHS[i - 1]) / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return ROUTE_WAYPOINTS[ROUTE_WAYPOINTS.length - 1];
}

export type ScavengeLogEntry = {
  /** Fraction of the trip at which this line gets written. */
  readonly at: number;
  readonly kind: "depart" | "empty" | "find" | "home";
  readonly text: string;
  /** Which stop the line is about, for marking the map. */
  readonly stopIndex?: number;
};

const EMPTY_HANDED_NOTES = [
  "nothing but broken ones.",
  "picked clean already.",
  "just cardboard bales today.",
  "a forklift guy waved me off.",
  "two plastic ones. no thanks.",
  "nothing. typical.",
];

/**
 * The trip's travel log, written up front from the pre-rolled loot (see
 * startScavengingAction) and revealed line by line as the trip
 * progresses. Seeded by the trip so the same trip always reads the same.
 */
export function buildScavengeLog(trip: ScavengingTrip): ScavengeLogEntry[] {
  const rng = seededRandom(`scavenge:${trip.returnTick}`);
  const pallets = trip.loot.filter(
    (material): material is Pallet => material.type === "pallet",
  );

  const shuffledStops = shuffle(
    SCAVENGE_STOPS.map((_, i) => i),
    rng,
  );
  const palletAtStop = new Map<number, Pallet>();
  for (const [i, pallet] of pallets.slice(0, SCAVENGE_STOPS.length).entries()) {
    palletAtStop.set(shuffledStops[i], pallet);
  }
  const notes = shuffle([...EMPTY_HANDED_NOTES], rng);

  const entries: ScavengeLogEntry[] = [
    { at: 0, kind: "depart", text: "Headed out with the hand truck." },
  ];
  let emptyStops = 0;
  for (const [i, stop] of SCAVENGE_STOPS.entries()) {
    const pallet = palletAtStop.get(i);
    entries.push(
      pallet
        ? {
            at: stop.at,
            kind: "find",
            stopIndex: i,
            text: `${stop.name} — score! ${describePalletFind(pallet)}`,
          }
        : {
            at: stop.at,
            kind: "empty",
            stopIndex: i,
            text: `${stop.name} — ${notes[emptyStops++ % notes.length]}`,
          },
    );
  }
  entries.push({
    at: HEADING_HOME_AT,
    kind: "home",
    text:
      pallets.length === 0
        ? "Struck out. Heading home empty-handed."
        : pallets.length === 1
          ? "Calling it — heading home with the pallet."
          : `Calling it — heading home with ${pallets.length} pallets.`,
  });
  return entries;
}

function describePalletFind(pallet: Pallet): string {
  const deckCount = pallet.deckBoards.filter(Boolean).length;
  const stringers =
    pallet.stringerBoardsLeft >= 3
      ? "stringers solid"
      : "one stringer's cracked";
  return `A pallet, ${deckCount} of 11 deck boards, ${stringers}.`;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
