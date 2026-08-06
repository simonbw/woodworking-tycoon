import React from "react";
import {
  headHomeFromScavengingAction,
  continueScavengingAction,
  keepScavengingBlock,
  scavengeLoot,
  SCAVENGE_RETURN_TICKS,
  SCAVENGE_STOP_TICKS,
} from "../../game/game-actions/scavenge-actions";
import { Pallet } from "../../game/Materials";
import { ScavengingTrip } from "../../game/Person";
import { formatDuration } from "../../game/time";
import { classNames } from "../../utils/classNames";
import { formatCount } from "../../utils/formatNumber";
import { seededRandom } from "../../utils/randUtils";
import { TripOverlay } from "../trip/TripOverlay";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The scavenging trip, shown while the player's away trip is a
 * scavenging one (see TruckPrompt / startScavengingAction). The trip is
 * a stop-by-stop circuit the player steers from the cab: an hour's
 * search reveals what the stop held, then the trip parks at a decision —
 * keep searching (another hour) or call it good enough and drive home.
 * The field notes record the circuit so far, and the truck alongside
 * shows the haul stacking up in the bed. The shop keeps ticking back
 * home.
 */
export const ScavengeTripOverlay: React.FC = () => {
  const gameState = useGameState();
  const away = gameState.player.away;
  if (away?.kind !== "scavenging") {
    return null;
  }
  return <ScavengeTrip trip={away} />;
};

const ScavengeTrip: React.FC<{ trip: ScavengingTrip }> = ({ trip }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const headHome = () => applyAction(headHomeFromScavengingAction());
  const keepSearching = () => applyAction(continueScavengingAction());

  const deciding = trip.phase.kind === "deciding";
  const block = keepScavengingBlock(gameState);
  const lines = buildLogLines(trip);
  const loot = scavengeLoot(trip);

  return (
    <TripOverlay
      label="Out scavenging"
      className="gap-6"
      testId="scavenge-trip"
      // Escape means "good enough" only while the trip is actually
      // waiting on the call — searching and the drive home have no keys.
      onHeadHome={deciding ? headHome : undefined}
    >
      <header className="flex items-baseline justify-between">
        <h1 className="section-heading">Out scavenging for pallets</h1>
        <div className="flex items-baseline gap-3">
          {trip.phase.kind === "drivingHome" ? (
            <>
              <span className="subsection-heading">Back in</span>
              <span className="font-bold tabular-nums text-paper-manila">
                {formatDuration(
                  Math.max(0, trip.phase.returnTick - gameState.tick),
                )}
              </span>
            </>
          ) : (
            <>
              <span className="subsection-heading">Time out</span>
              <span className="font-bold tabular-nums text-paper-manila">
                {formatDuration(gameState.tick - trip.startTick)}
              </span>
            </>
          )}
        </div>
      </header>
      <div className="flex min-h-0 grow items-stretch justify-center gap-8">
        <LogSheet lines={lines} />
        <div className="flex w-[26rem] shrink-0 flex-col justify-center gap-6">
          <TruckCard palletCount={loot.length} />
          {deciding && (
            <DecisionPanel
              block={block}
              onKeepSearching={keepSearching}
              onHeadHome={headHome}
            />
          )}
        </div>
      </div>
    </TripOverlay>
  );
};

// ---------------------------------------------------------------------------
// The field notes
// ---------------------------------------------------------------------------

const EMPTY_HANDED_NOTES = [
  "nothing but broken ones.",
  "picked clean already.",
  "just cardboard bales today.",
  "a forklift guy waved me off.",
  "two plastic ones. no thanks.",
  "nothing. typical.",
];

type LogLine = {
  readonly text: string;
  /** A find — written heavier, the way a good day gets underlined. */
  readonly emphasis?: boolean;
  /** Still happening — the pen hasn't finished the line. */
  readonly pending?: boolean;
};

/**
 * The trip's travel log, one line per event so far. Derived fresh from
 * the trip every render; the empty-handed flavor is seeded by the trip's
 * start so a given trip always reads the same.
 */
function buildLogLines(trip: ScavengingTrip): LogLine[] {
  const rng = seededRandom(`scavenge:${trip.startTick}`);
  const notes = shuffle([...EMPTY_HANDED_NOTES], rng);

  const lines: LogLine[] = [{ text: "Headed out with the hand truck." }];
  let emptyStops = 0;
  for (const stop of trip.stops.slice(0, trip.stopsSearched)) {
    lines.push(
      stop.pallet
        ? {
            text: `${stop.stopName} — score! ${describePalletFind(stop.pallet)}`,
            emphasis: true,
          }
        : {
            text: `${stop.stopName} — ${notes[emptyStops++ % notes.length]}`,
          },
    );
  }
  if (trip.phase.kind === "searching") {
    const nextStop = trip.stops[trip.stopsSearched];
    lines.push({
      text: `Digging through pallets at ${nextStop.stopName}…`,
      pending: true,
    });
  }
  if (trip.phase.kind === "drivingHome") {
    const palletCount = scavengeLoot(trip).length;
    lines.push({
      text:
        palletCount === 0
          ? "Struck out. Heading home empty-handed."
          : palletCount === 1
            ? "Calling it — heading home with the pallet."
            : `Calling it — heading home with ${palletCount} pallets.`,
    });
  }
  return lines;
}

function describePalletFind(pallet: Pallet): string {
  const deckCount = pallet.deckBoards.filter(Boolean).length;
  const stringers = pallet.stringers.every(Boolean)
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

const LogSheet: React.FC<{ lines: LogLine[] }> = ({ lines }) => (
  <section className="flex w-80 shrink-0 rotate-[0.5deg] flex-col">
    <div
      className="lined-sheet min-h-0 grow overflow-y-auto"
      data-testid="scavenge-log"
    >
      <ul>
        <li className="font-condensed text-xs uppercase leading-[2rem] tracking-[0.15em] text-ink-fade">
          Pallet run — field notes
        </li>
        {lines.map((line, i) => (
          <li
            key={i}
            className={classNames(
              "font-ink text-lg leading-[2rem] text-ink-blue",
              line.emphasis && "font-bold",
              line.pending && "text-ink-blue/60",
            )}
          >
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// The truck
// ---------------------------------------------------------------------------

// SVG paint attributes take raw colors; these are the paperwork ink and
// gold tokens from tailwind.config.ts.
const INK_BLACK = "#1a1a1a";
const INK_FADE = "#5a5550";
const INK_BROWN = "#5c3d2e";
const GOLD_DARK = "#9c7e3f";

const TRUCK_W = 260;
const TRUCK_H = 150;
/** Top of the bed rail — pallets stack upward from here. */
const BED_RAIL_Y = 98;

/**
 * The pickup, sketched side-on in the same hand as the rest of the
 * paperwork, with the haul stacked in the bed one pallet per find — the
 * running tally the player is really deciding with.
 */
const TruckCard: React.FC<{ palletCount: number }> = ({ palletCount }) => (
  <section className="paper-card -rotate-[0.4deg] flex flex-col gap-1">
    <div className="font-ink text-xl leading-none text-ink-blue">The haul</div>
    <svg
      viewBox={`0 0 ${TRUCK_W} ${TRUCK_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      role="img"
      aria-label={`The truck, ${formatCount(palletCount)} pallets in the bed`}
    >
      {/* Ground */}
      <line
        x1={8}
        y1={136}
        x2={TRUCK_W - 8}
        y2={136}
        stroke={INK_FADE}
        strokeWidth={2}
        strokeDasharray="6 5"
        opacity={0.5}
      />

      {/* Pallets, oldest at the bottom of the stack */}
      {Array.from({ length: palletCount }, (_, i) => (
        <PalletSideView key={i} y={BED_RAIL_Y - 11 * (i + 1)} />
      ))}

      {/* Body: nose left, low-walled bed so the load shows */}
      <path
        d={`M 22 112 L 22 88 L 38 80 L 68 78 L 84 56 L 114 54 L 118 78
            L 118 ${BED_RAIL_Y} L 246 ${BED_RAIL_Y} L 246 118 L 22 112 Z`}
        fill="none"
        stroke={INK_BLACK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* Cab window */}
      <path
        d="M 88 60 L 110 58 L 112 74 L 86 76 Z"
        fill="none"
        stroke={INK_BLACK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Door seam + handle */}
      <line
        x1={118}
        y1={BED_RAIL_Y}
        x2={118}
        y2={114}
        stroke={INK_BLACK}
        strokeWidth={2}
      />
      <line
        x1={96}
        y1={82}
        x2={106}
        y2={82}
        stroke={INK_BLACK}
        strokeWidth={2}
      />

      {/* Wheels over the body line — comic style, no wheel arches */}
      <Wheel cx={64} />
      <Wheel cx={204} />
    </svg>
    <div
      className="font-condensed text-sm uppercase tracking-[0.15em] text-ink-fade text-center"
      data-testid="scavenge-bed-count"
    >
      {palletCount === 0
        ? "Nothing in the bed yet"
        : palletCount === 1
          ? "1 pallet in the bed"
          : `${formatCount(palletCount)} pallets in the bed`}
    </div>
  </section>
);

const Wheel: React.FC<{ cx: number }> = ({ cx }) => (
  <g>
    <circle
      cx={cx}
      cy={120}
      r={15}
      fill="#e8dcc0"
      stroke={INK_BLACK}
      strokeWidth={3}
    />
    <circle
      cx={cx}
      cy={120}
      r={5}
      fill="none"
      stroke={INK_BLACK}
      strokeWidth={2}
    />
  </g>
);

/** One pallet lying flat in the bed, seen edge-on: deck, gap, deck. */
const PalletSideView: React.FC<{ y: number }> = ({ y }) => (
  <g data-testid="scavenge-bed-pallet">
    <rect
      x={126}
      y={y}
      width={112}
      height={9}
      fill={GOLD_DARK}
      opacity={0.35}
    />
    <rect
      x={126}
      y={y}
      width={112}
      height={9}
      fill="none"
      stroke={INK_BROWN}
      strokeWidth={2}
    />
    {/* Stringer ends showing through the slats */}
    <line
      x1={160}
      y1={y + 2}
      x2={160}
      y2={y + 7}
      stroke={INK_BROWN}
      strokeWidth={2}
    />
    <line
      x1={200}
      y1={y + 2}
      x2={200}
      y2={y + 7}
      stroke={INK_BROWN}
      strokeWidth={2}
    />
  </g>
);

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/**
 * The call the whole trip is built around, made from the cab: another
 * hour of searching, or good enough. Both buttons carry their cost in
 * time — that's the price being weighed. When another stop can't happen
 * (the circuit's used up, or the search plus the drive home wouldn't
 * fit before close) the button stays visible but dead, with the reason
 * written under it, and home is the only way left.
 */
const DecisionPanel: React.FC<{
  block: ReturnType<typeof keepScavengingBlock>;
  onKeepSearching: () => void;
  onHeadHome: () => void;
}> = ({ block, onKeepSearching, onHeadHome }) => (
  <section className="flex flex-col gap-2" data-testid="scavenge-decision">
    <button
      className="button py-2 text-base"
      disabled={block !== null}
      onClick={onKeepSearching}
      data-testid="scavenge-keep-searching"
    >
      Keep searching · {formatDuration(SCAVENGE_STOP_TICKS)}
    </button>
    {block === "outOfDaylight" && (
      <div className="text-center font-condensed text-sm uppercase tracking-wider text-paper-manila/60">
        Not enough daylight left for another stop
      </div>
    )}
    {block === "outOfStops" && (
      <div className="text-center font-condensed text-sm uppercase tracking-wider text-paper-manila/60">
        That&apos;s every spot on the circuit
      </div>
    )}
    <button
      className="button py-2 text-base"
      onClick={onHeadHome}
      data-testid="scavenge-head-home"
    >
      Good enough — head home · {formatDuration(SCAVENGE_RETURN_TICKS)}
    </button>
  </section>
);
