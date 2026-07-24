import React, { useMemo } from "react";
import { SCAVENGE_DURATION_TICKS } from "../../game/game-actions/scavenge-actions";
import { ScavengingTrip } from "../../game/Person";
import { classNames } from "../../utils/classNames";
import { useGameState } from "../useGameState";
import {
  buildScavengeLog,
  MAP_HEIGHT,
  MAP_WIDTH,
  pointAtProgress,
  ROUTE_WAYPOINTS,
  SCAVENGE_STOPS,
  ScavengeLogEntry,
} from "./scavenge-route";

/**
 * The scavenging trip, shown while the player's away trip is a
 * scavenging one (see DoorPrompt / startScavengingAction). Unlike the
 * store trips there is nothing to buy and no way home but the clock: the
 * overlay is a travel log — a hand-drawn map of the pallet circuit with
 * the route filling in, and field notes revealing the pre-rolled haul
 * stop by stop. The shop keeps ticking back home.
 */
export const ScavengeTripOverlay: React.FC = () => {
  const gameState = useGameState();
  const away = gameState.player.away;
  if (away?.kind !== "scavenging") {
    return null;
  }
  return <ScavengeTrip trip={away} tick={gameState.tick} />;
};

const ScavengeTrip: React.FC<{ trip: ScavengingTrip; tick: number }> = ({
  trip,
  tick,
}) => {
  const ticksLeft = Math.max(0, trip.returnTick - tick);
  // Injected/legacy trips may be longer than the standard duration;
  // clamp so progress just waits at the start instead of going negative.
  const progress = Math.min(
    1,
    Math.max(0, 1 - ticksLeft / SCAVENGE_DURATION_TICKS),
  );
  const log = useMemo(() => buildScavengeLog(trip), [trip]);
  const visibleEntries = log.filter((entry) => entry.at <= progress);
  const foundStops = new Set(
    visibleEntries
      .filter((entry) => entry.kind === "find")
      .map((entry) => entry.stopIndex),
  );

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col gap-6 overflow-hidden bg-workshop-bg p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Out scavenging"
      data-testid="scavenge-trip"
    >
      <header className="flex items-baseline justify-between">
        <h1 className="section-heading">Out scavenging for pallets</h1>
        <div className="flex items-baseline gap-3">
          <span className="subsection-heading">Back in</span>
          <span className="font-mono tabular-nums text-paper-manila">
            {ticksLeft} ticks
          </span>
        </div>
      </header>
      <div className="flex min-h-0 grow justify-center gap-6">
        <NeighborhoodMap progress={progress} foundStops={foundStops} />
        <LogSheet entries={visibleEntries} />
      </div>
    </div>
  );
};

// SVG paint attributes take raw colors; these are the paperwork ink and
// gold tokens from tailwind.config.ts.
const INK_BLACK = "#1a1a1a";
const INK_BLUE = "#1f3a6e";
const INK_FADE = "#5a5550";
const INK_BROWN = "#5c3d2e";
const GOLD_DARK = "#9c7e3f";

const ROUTE_PATH = ROUTE_WAYPOINTS.map(
  (point, i) => `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`,
).join(" ");

/** Per-stop label placement, tuned by hand to dodge the route. */
const STOP_LABELS: ReadonlyArray<{
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
}> = [
  { dx: 0, dy: -14, anchor: "middle" }, // Orange Box
  { dx: 0, dy: 22, anchor: "middle" }, // Grocery dock
  { dx: -14, dy: -12, anchor: "end" }, // Tile warehouse
  { dx: 0, dy: -14, anchor: "middle" }, // Print shop
  { dx: 0, dy: -14, anchor: "middle" }, // Furniture factory
];

const NeighborhoodMap: React.FC<{
  progress: number;
  foundStops: ReadonlySet<number | undefined>;
}> = ({ progress, foundStops }) => {
  const marker = pointAtProgress(progress);
  const shop = ROUTE_WAYPOINTS[0];

  return (
    <section className="paper-card flex min-h-0 max-w-4xl grow -rotate-[0.4deg] flex-col gap-1">
      <div className="font-ink text-xl leading-none text-ink-blue">
        The usual circuit
      </div>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="min-h-0 w-full grow"
        role="img"
        aria-label="Map of the scavenging route"
      >
        <defs>
          <mask
            id="scavenge-traveled"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
          >
            <path
              d={ROUTE_PATH}
              pathLength={1}
              fill="none"
              stroke="white"
              strokeWidth={10}
              strokeDasharray="1 1"
              strokeDashoffset={1 - progress}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
        </defs>

        {/* Coffee stain in the middle of the loop */}
        <circle
          cx={225}
          cy={155}
          r={26}
          fill="none"
          stroke={INK_BROWN}
          strokeWidth={5}
          opacity={0.12}
        />
        <circle cx={238} cy={172} r={6} fill={INK_BROWN} opacity={0.08} />

        {/* Compass doodle */}
        <g stroke={INK_FADE} fill="none" opacity={0.8}>
          <circle cx={445} cy={44} r={13} />
          <path d="M 445 54 L 445 34 M 441 39 L 445 34 L 449 39" />
        </g>
        <text
          x={445}
          y={24}
          textAnchor="middle"
          className="font-condensed"
          fontSize={11}
          fill={INK_FADE}
        >
          N
        </text>
        <text
          x={MAP_WIDTH - 8}
          y={MAP_HEIGHT - 8}
          textAnchor="end"
          className="font-ink"
          fontSize={14}
          fill={INK_FADE}
        >
          not to scale
        </text>

        {/* The full route, faint; the traveled part inks in on top */}
        <path
          d={ROUTE_PATH}
          fill="none"
          stroke={INK_FADE}
          strokeWidth={2.5}
          strokeDasharray="7 6"
          strokeLinejoin="round"
          opacity={0.35}
        />
        <path
          d={ROUTE_PATH}
          fill="none"
          stroke={INK_BLUE}
          strokeWidth={3}
          strokeDasharray="7 6"
          strokeLinejoin="round"
          mask="url(#scavenge-traveled)"
        />

        {/* The shop */}
        <g>
          <rect
            x={shop.x - 7}
            y={shop.y - 6}
            width={14}
            height={12}
            fill="none"
            stroke={INK_BLACK}
            strokeWidth={2}
          />
          <path
            d={`M ${shop.x - 9} ${shop.y - 6} L ${shop.x} ${shop.y - 14} L ${shop.x + 9} ${shop.y - 6}`}
            fill="none"
            stroke={INK_BLACK}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <text
            x={shop.x}
            y={shop.y + 24}
            textAnchor="middle"
            className="font-condensed"
            fontSize={11}
            letterSpacing={1}
            fill={INK_BLACK}
          >
            THE SHOP
          </text>
        </g>

        {/* Stops: hollow until visited, X'd when empty, gold when a find */}
        {SCAVENGE_STOPS.map((stop, i) => {
          const visited = progress >= stop.at;
          const found = visited && foundStops.has(i);
          const label = STOP_LABELS[i];
          return (
            <g key={stop.name}>
              {found ? (
                <circle
                  cx={stop.point.x}
                  cy={stop.point.y}
                  r={6}
                  fill={GOLD_DARK}
                  stroke={INK_BLACK}
                  strokeWidth={1.5}
                />
              ) : (
                <circle
                  cx={stop.point.x}
                  cy={stop.point.y}
                  r={5}
                  fill="none"
                  stroke={visited ? INK_BLUE : INK_FADE}
                  strokeWidth={2}
                />
              )}
              {visited && !found && (
                <path
                  d={`M ${stop.point.x - 4} ${stop.point.y - 4} L ${stop.point.x + 4} ${stop.point.y + 4} M ${stop.point.x + 4} ${stop.point.y - 4} L ${stop.point.x - 4} ${stop.point.y + 4}`}
                  stroke={INK_BLUE}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              )}
              <text
                x={stop.point.x + label.dx}
                y={stop.point.y + label.dy}
                textAnchor={label.anchor}
                className="font-condensed"
                fontSize={11}
                letterSpacing={1}
                fill={INK_BLACK}
                opacity={0.75}
              >
                {stop.name.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* You are here */}
        <circle
          cx={marker.x}
          cy={marker.y}
          r={5.5}
          fill={GOLD_DARK}
          stroke={INK_BLACK}
          strokeWidth={2}
        />
      </svg>
    </section>
  );
};

const LogSheet: React.FC<{ entries: ScavengeLogEntry[] }> = ({ entries }) => (
  <section className="flex w-80 shrink-0 rotate-[0.5deg] flex-col">
    <div
      className="lined-sheet min-h-0 grow overflow-y-auto"
      data-testid="scavenge-log"
    >
      <ul>
        <li className="font-condensed text-xs uppercase leading-[2rem] tracking-[0.15em] text-ink-fade">
          Pallet run — field notes
        </li>
        {entries.map((entry, i) => (
          <li
            key={i}
            className={classNames(
              "font-ink text-lg leading-[2rem] text-ink-blue",
              entry.kind === "find" && "font-bold",
            )}
          >
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  </section>
);
