import React, { useEffect, useRef, useState } from "react";
import {
  headHomeFromScavengingAction,
  continueScavengingAction,
  keepScavengingBlock,
  scavengeLoot,
  SCAVENGE_STOP_TICKS,
} from "../../game/game-actions/scavenge-actions";
import { Pallet } from "../../game/Materials";
import { ScavengingTrip } from "../../game/Person";
import { formatDuration } from "../../game/time";
import { classNames } from "../../utils/classNames";
import { formatCount } from "../../utils/formatNumber";
import { seededRandom } from "../../utils/randUtils";
import { DayClock } from "../DayClock";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { TripOverlay } from "../trip/TripOverlay";
import {
  TRIP_TRANSITIONS_DISABLED,
  useHeadHome,
} from "../trip/TripTransitionLayer";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ScavengeDrivingSound } from "./ScavengeDrivingSound";

/**
 * The scavenging trip, shown while the player's away trip is a
 * scavenging one (see TruckPrompt / startScavengingAction). The trip is
 * a stop-by-stop circuit the player steers from the cab: half an hour's
 * driving and digging reveals what a stop held, then the trip parks at a
 * decision — keep searching (another half-hour) or call it good enough
 * and pull back into the shop, which is free. The shop keeps ticking
 * back home, which is why the day's clock is up here too: the daylight
 * left is the whole cost being weighed.
 *
 * One picture, one line of what just happened, two buttons — the layout
 * is the same size in every phase, so nothing moves when the player
 * presses anything. The only thing that changes is whether the truck is
 * driving.
 */
export const ScavengeTripOverlay: React.FC = () => {
  const gameState = useGameState();
  const away = gameState.player.away;
  if (away?.kind !== "scavenging") {
    return null;
  }
  return <ScavengeTrip trip={away} />;
};

/**
 * How long the truck is under way before the screen starts to dip. The
 * fade then plays over a truck that is already rolling, so the trip ends
 * on the same picture it ran on rather than cutting away from a parked
 * drawing.
 */
const PULL_AWAY_MS = 500;

const ScavengeTrip: React.FC<{ trip: ScavengingTrip }> = ({ trip }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const fadeThen = useHeadHome();
  // Set the moment the player calls it, and never cleared: this
  // component is unmounted by the return it sets in motion.
  const [leaving, setLeaving] = useState(false);
  const pullAway = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pullAway.current) clearTimeout(pullAway.current);
    },
    [],
  );

  // Ending the trip is instant in game time, so it gets the same
  // fade-to-black-then-arrive performance a store's Head Home does —
  // with the truck pulling away first.
  const backToShop = () => {
    if (leaving) return;
    const goHome = () =>
      fadeThen(() => applyAction(headHomeFromScavengingAction()));
    if (TRIP_TRANSITIONS_DISABLED) {
      goHome();
      return;
    }
    setLeaving(true);
    pullAway.current = setTimeout(goHome, PULL_AWAY_MS);
  };
  const keepSearching = () => applyAction(continueScavengingAction());

  const searching = trip.phase.kind === "searching";
  const deciding = trip.phase.kind === "deciding" && !leaving;
  const block = keepScavengingBlock(gameState);
  const loot = scavengeLoot(trip);

  return (
    <TripOverlay
      label="Out scavenging"
      className="gap-6"
      testId="scavenge-trip"
      // Escape means "good enough" only while the trip is actually
      // waiting on the call — a search in progress has no keys.
      onHeadHome={deciding ? backToShop : undefined}
    >
      <ScavengeDrivingSound driving={searching || leaving} />
      <header className="flex items-baseline justify-between">
        <h1 className="section-heading">Out scavenging for pallets</h1>
        <DayClock />
      </header>
      <div className="flex min-h-0 grow items-center justify-center">
        <div className="flex w-[30rem] flex-col gap-5">
          <TruckDrawing
            palletCount={loot.length}
            driving={searching || leaving}
          />
          <StopLine trip={trip} />
          <DecisionPanel
            block={block}
            canDecide={deciding}
            onKeepSearching={keepSearching}
            onBackToShop={backToShop}
          />
        </div>
      </div>
    </TripOverlay>
  );
};

// ---------------------------------------------------------------------------
// What just happened
// ---------------------------------------------------------------------------

const EMPTY_HANDED_NOTES = [
  "nothing but broken ones.",
  "picked clean already.",
  "just cardboard bales today.",
  "a forklift guy waved me off.",
  "two plastic ones. no thanks.",
  "nothing. typical.",
];

/**
 * One line: where the truck is now, or what the last stop turned up. The
 * empty-handed flavor is seeded by the trip's start, so a given stop on
 * a given trip always reads the same however often it re-renders.
 *
 * Two lines' worth of height is reserved whatever it says — this sits
 * between the picture and the buttons, and the buttons must not move.
 */
const StopLine: React.FC<{ trip: ScavengingTrip }> = ({ trip }) => {
  const rng = seededRandom(`scavenge:${trip.startTick}`);
  const notes = shuffle([...EMPTY_HANDED_NOTES], rng);

  let text: string;
  let found = false;
  if (trip.phase.kind === "searching") {
    const nextStop = trip.stops[trip.stopsSearched];
    text = `Digging through the pallets at ${nextStop.stopName}…`;
  } else {
    const stop = trip.stops[trip.stopsSearched - 1];
    if (!stop) {
      text = "Headed out with the hand truck.";
    } else if (stop.pallet) {
      found = true;
      text = `${stop.stopName} — score! ${describePalletFind(stop.pallet)}`;
    } else {
      // Which flavor line: the count of empty stops so far, so a second
      // strikeout doesn't repeat the first one's excuse.
      const emptyStops = trip.stops
        .slice(0, trip.stopsSearched)
        .filter((s) => !s.pallet).length;
      text = `${stop.stopName} — ${notes[(emptyStops - 1) % notes.length]}`;
    }
  }

  return (
    <p
      className={classNames(
        "flex h-14 items-center justify-center px-4 text-center font-ink text-lg leading-snug",
        found ? "font-bold text-gold" : "text-paper-manila",
        trip.phase.kind === "searching" && "text-paper-manila/60",
      )}
      data-testid="scavenge-stop-line"
    >
      {text}
    </p>
  );
};

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

// ---------------------------------------------------------------------------
// The truck
// ---------------------------------------------------------------------------

// SVG paint attributes take raw colors; these are the paperwork ink and
// gold tokens from tailwind.config.ts.
const INK_BLACK = "#1a1a1a";
const INK_FADE = "#5a5550";
const INK_BROWN = "#5c3d2e";
/** The card's own paper — what the hubcaps are filled with. */
const PAPER_MANILA = "#e6d5a8";
/**
 * The wood in the bed, taken from the species map the shop floor and the
 * bench draw pallets with — a haul should be the same yellow here as it
 * is when it lands. The ink outline stays: this is a sketch on manila,
 * and the fill alone is too close to the paper to hold a shape.
 */
const PALLET_WOOD = colorBySpecies.pallet.primary;

const TRUCK_W = 260;
const TRUCK_H = 150;
/** Top of the bed rail — pallets stack upward from here. */
const BED_RAIL_Y = 98;
/** The wheels' centers, shared by the art and the spin's pivot. */
const FRONT_AXLE_X = 64;
const REAR_AXLE_X = 204;
const AXLE_Y = 120;
const ROAD_Y = 136;
/** The sill, level end to end on an empty truck. */
const BODY_BOTTOM_Y = 115;
/** The bottom of the door glass, level like the sill above it. */
const WINDOW_SILL_Y = 75;

/**
 * How far the springs give under each pallet, as the rear-axle drop it
 * would cause in user units. Taken about the middle of the wheelbase, so
 * the load drops the tail and lifts the nose — the way an overloaded
 * pickup actually sits, and a running readout of the haul that costs no
 * extra ink.
 */
const SAG_PER_PALLET = 1.1;

function sagDegrees(palletCount: number): number {
  const halfWheelbase = (REAR_AXLE_X - FRONT_AXLE_X) / 2;
  return (
    (Math.atan((SAG_PER_PALLET * palletCount) / halfWheelbase) * 180) / Math.PI
  );
}

/**
 * The road's stripe, in SVG user units: one dash plus one gap is the
 * ground the truck covers in a full cycle of the pattern.
 */
const ROAD_DASH = 18;
const ROAD_GAP = 15;
const ROAD_PATTERN = ROAD_DASH + ROAD_GAP;

/**
 * The wheel, sized from the outside in. `TIRE_OUTER_RADIUS` is the
 * rubber that meets the road — the circle that has to roll without
 * slipping, and the one thing here that must not move: the tire can be
 * drawn as fat as it likes without changing how far a turn carries the
 * truck. The stroke is centered on the drawn radius, so that radius
 * backs off by half the stroke to keep the outside where it is.
 */
const TIRE_OUTER_RADIUS = 16.5;
const WHEEL_STROKE = 8;
const WHEEL_RADIUS = TIRE_OUTER_RADIUS - WHEEL_STROKE / 2;
const TIRE_CIRCUMFERENCE = 2 * Math.PI * TIRE_OUTER_RADIUS;
/** The hubcap: everything the tire's inner edge encloses. */
const HUBCAP_RADIUS = TIRE_OUTER_RADIUS - WHEEL_STROKE;

/** Five lugs, set well inside the hubcap — enough to read a turn, few
 *  enough to stay dots rather than a texture. */
const LUG_ANGLES = [0, 72, 144, 216, 288];
const LUG_ORBIT = HUBCAP_RADIUS * 0.55;
const LUG_RADIUS = 1.5;

/**
 * How fast the ground goes by, in user units per millisecond. This is
 * the only speed in the drawing: the stripe's offset and the wheels'
 * rotation are both computed from the same travelled distance, so a
 * wheel turns exactly once per `TIRE_CIRCUMFERENCE` of road — no
 * skidding, and no pair of hand-tuned durations to keep in step.
 */
const GROUND_UNITS_PER_MS = ROAD_PATTERN / 420;

/** Pulling away, and coasting to a stop at the end of the leg. */
const SPIN_UP_MS = 550;
const SPIN_DOWN_MS = 800;

/**
 * Drives the road and the wheels off one travelled distance, ramped in
 * and out so the truck never snaps between parked and full speed.
 *
 * Written straight to the DOM from a rAF loop rather than through state:
 * this runs at frame rate over an overlay that re-renders on every game
 * tick, and the motion has nothing to do with those ticks. The loop
 * sleeps once the truck has come to a complete stop.
 */
function useDrivingMotion(
  driving: boolean,
  road: React.RefObject<SVGLineElement | null>,
  wheels: ReadonlyArray<React.RefObject<SVGGElement | null>>,
): void {
  // Where the ramp stands, 0 (parked) to 1 (full speed), and how far the
  // truck has travelled. Both survive a driving flip mid-ramp, so a leg
  // starting while the last one is still slowing picks up where it is.
  const ramp = useRef(0);
  const distance = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min(now - last, 100);
      last = now;

      const target = driving ? 1 : 0;
      const rampMs = driving ? SPIN_UP_MS : SPIN_DOWN_MS;
      ramp.current =
        target > ramp.current
          ? Math.min(target, ramp.current + elapsed / rampMs)
          : Math.max(target, ramp.current - elapsed / rampMs);
      // Smoothstep: zero slope at both ends, so the pull-away and the
      // coast to a stop have no corner in them.
      const speed = ramp.current * ramp.current * (3 - 2 * ramp.current);
      distance.current += GROUND_UNITS_PER_MS * speed * elapsed;

      // The truck faces left, so the stripe streams to the right (a
      // negative dash offset) and the wheels turn counter-clockwise.
      // Both are periodic; wrapping keeps the numbers small on a long
      // circuit rather than drifting into float mush.
      const travelled = distance.current;
      road.current?.setAttribute(
        "stroke-dashoffset",
        String(-(travelled % ROAD_PATTERN)),
      );
      const turns = (travelled % TIRE_CIRCUMFERENCE) / TIRE_CIRCUMFERENCE;
      for (const wheel of wheels) {
        if (wheel.current) {
          wheel.current.style.rotate = `${-turns * 360}deg`;
        }
      }

      // Parked and staying parked: nothing to animate until the next leg.
      if (!driving && ramp.current === 0) return;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [driving]);
}

/**
 * The pickup, sketched side-on in the same hand as the rest of the
 * paperwork, with the haul stacked in the bed one pallet per find — the
 * running tally the player is really deciding with. While a search is
 * running it is drawn *driving*: the road streams past under it and the
 * wheels turn. It pulls away when the search starts and coasts to a stop
 * as the trip parks at its decision — the motion IS the readout that the
 * half-hour is being driven rather than waited out.
 */
const TruckDrawing: React.FC<{ palletCount: number; driving: boolean }> = ({
  palletCount,
  driving,
}) => {
  const road = useRef<SVGLineElement>(null);
  const frontWheel = useRef<SVGGElement>(null);
  const rearWheel = useRef<SVGGElement>(null);
  useDrivingMotion(driving, road, [frontWheel, rearWheel]);

  return (
    <section className="paper-card -rotate-[0.4deg] flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${TRUCK_W} ${TRUCK_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        role="img"
        aria-label={`The truck, ${formatCount(palletCount)} pallets in the bed`}
        data-testid="scavenge-truck"
        data-driving={driving ? "true" : "false"}
      >
        {/* The road, drawn as its dashes — they stream out from under the
          truck while it drives (see useDrivingMotion). */}
        <line
          ref={road}
          x1={-40}
          y1={ROAD_Y}
          x2={TRUCK_W + 40}
          y2={ROAD_Y}
          stroke={INK_FADE}
          strokeWidth={2}
          strokeDasharray={`${ROAD_DASH} ${ROAD_GAP}`}
          opacity={0.5}
        />

        {/* Everything the springs carry rides in one group, so the load's
            sag tilts the body, its glass, and the stack together. The
            wheels stay outside it: they're on the road either way. */}
        <g
          className="truck-sag"
          style={{
            transformBox: "view-box",
            transformOrigin: `${(FRONT_AXLE_X + REAR_AXLE_X) / 2}px ${AXLE_Y}px`,
            transform: `rotate(${sagDegrees(palletCount)}deg)`,
          }}
        >
          {/* Pallets, oldest at the bottom of the stack */}
          {Array.from({ length: palletCount }, (_, i) => (
            <PalletSideView key={i} y={BED_RAIL_Y - 11 * (i + 1)} />
          ))}

          {/* Body: nose left, low-walled bed so the load shows. The sill
              runs level — the truck is only ever nose-up because it's
              loaded, never because it was drawn that way. */}
          <path
            d={`M 22 ${BODY_BOTTOM_Y} L 22 88 L 38 80 L 68 78 L 84 56
              L 114 54 L 118 78 L 118 ${BED_RAIL_Y} L 246 ${BED_RAIL_Y}
              L 246 ${BODY_BOTTOM_Y} Z`}
            fill="none"
            stroke={INK_BLACK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {/* Cab window: raked at the top, level along the sill */}
          <path
            d={`M 88 60 L 110 58 L 112 ${WINDOW_SILL_Y} L 86 ${WINDOW_SILL_Y} Z`}
            fill="none"
            stroke={INK_BLACK}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* The door, front edge to back: the front one drops from the
              cowl, under the A-pillar, and the front wheel covers where it
              runs out. */}
          <line
            x1={68}
            y1={78}
            x2={68}
            y2={BODY_BOTTOM_Y - 1}
            stroke={INK_BLACK}
            strokeWidth={2}
          />
          <line
            x1={118}
            y1={BED_RAIL_Y}
            x2={118}
            y2={BODY_BOTTOM_Y - 1}
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
        </g>

        {/* Wheels over the body line — comic style, no wheel arches */}
        <Wheel cx={FRONT_AXLE_X} hubRef={frontWheel} />
        <Wheel cx={REAR_AXLE_X} hubRef={rearWheel} />
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
};

/**
 * A wheel: the heavy stroke is the tire, and everything inside it is the
 * hubcap — filled with the page's own paper so the road and the sill
 * pass behind it rather than through it. The spin reads on the lugnuts,
 * the only thing on the wheel that isn't rotationally symmetric; the
 * group carrying them is handed up to `useDrivingMotion`, which turns it.
 */
const Wheel: React.FC<{
  cx: number;
  hubRef: React.RefObject<SVGGElement | null>;
}> = ({ cx, hubRef }) => (
  <g>
    <circle
      cx={cx}
      cy={AXLE_Y}
      r={WHEEL_RADIUS}
      fill={PAPER_MANILA}
      stroke={INK_BLACK}
      strokeWidth={WHEEL_STROKE}
    />
    <g
      ref={hubRef}
      style={{
        transformBox: "view-box",
        transformOrigin: `${cx}px ${AXLE_Y}px`,
      }}
    >
      {LUG_ANGLES.map((angle) => {
        const radians = (angle * Math.PI) / 180;
        return (
          <circle
            key={angle}
            cx={cx + LUG_ORBIT * Math.cos(radians)}
            cy={AXLE_Y + LUG_ORBIT * Math.sin(radians)}
            r={LUG_RADIUS}
            fill={INK_BLACK}
          />
        );
      })}
    </g>
  </g>
);

/** One pallet lying flat in the bed, seen edge-on: deck, gap, deck. */
const PalletSideView: React.FC<{ y: number }> = ({ y }) => (
  <g data-testid="scavenge-bed-pallet">
    <rect x={126} y={y} width={112} height={9} fill={PALLET_WOOD} />
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
 * half-hour of searching, or good enough. Only the search costs time —
 * the circuit runs past the shop, so pulling back in is free, and the
 * button says so.
 *
 * Both buttons are always here, dead while a search is running and when
 * another stop can't happen (the circuit's used up, or the search
 * wouldn't fit before close). Nothing is ever added or taken away, so
 * the panel never moves under the player's cursor; the reason a search
 * is refused writes into a line that is always reserved.
 */
const DecisionPanel: React.FC<{
  block: ReturnType<typeof keepScavengingBlock>;
  canDecide: boolean;
  onKeepSearching: () => void;
  onBackToShop: () => void;
}> = ({ block, canDecide, onKeepSearching, onBackToShop }) => (
  <section className="flex flex-col gap-2" data-testid="scavenge-decision">
    <button
      className="button py-2 text-base"
      disabled={block !== null}
      onClick={onKeepSearching}
      data-testid="scavenge-keep-searching"
    >
      Keep searching · {formatDuration(SCAVENGE_STOP_TICKS)}
    </button>
    <div className="flex h-5 items-center justify-center text-center font-condensed text-sm uppercase tracking-wider text-paper-manila/60">
      {block === "outOfDaylight" && "Not enough daylight left for another stop"}
      {block === "outOfStops" && "That's every spot on the circuit"}
    </div>
    <button
      className="button py-2 text-base"
      disabled={!canDecide}
      onClick={onBackToShop}
      data-testid="scavenge-head-home"
    >
      Good enough — back to the shop
    </button>
  </section>
);
