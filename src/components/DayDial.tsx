import React from "react";
import { formatShopDate, shopDateParts } from "../game/calendar";
import { DayPhase } from "../game/time";

/**
 * The clock in the top bar: the date, with the sun and the moon going
 * around it.
 *
 * There is still deliberately no wall clock (see `docs/time-and-days.md`)
 * — nothing here reads out an hour. What it shows is where the sun stands,
 * which is how the shop tells time everywhere else: high and the day is
 * young, low on the right and you should be thinking about the drive home,
 * gone and the shop is closed. The sun and moon sit opposite each other on
 * one orbit, so the one below the horizon is always the ghost of the one
 * above.
 *
 * The daylight arc doubles as the day's progress meter — it fills from
 * sunrise to wherever the sun has got to — which is what the top bar's
 * gold hairline used to do on its own.
 */

/**
 * SVG user units, and the size the dial renders at in CSS pixels. The
 * orbit has to clear the date sitting inside it: the month and the day
 * number are stacked like a desk calendar's page precisely so the ring can
 * stay small enough to belong in a top bar.
 */
const BOX = 80;
const SIZE = 68;
const CENTER = BOX / 2;
// 29 rather than 30 so the sun's outermost ray still lands inside the box
// when it's overhead, and nothing relies on the SVG overflowing.
const ORBIT_RADIUS = 29;

/**
 * Where the sun sits at the open and at the close, as compass-style angles
 * measured up from the horizon (0° = due horizon, 90° = overhead). It rises
 * and sets a little way *above* the horizon rather than exactly on it, so
 * the first and last hours of the day still show a whole sun instead of one
 * sliced by the edge of the dial.
 */
const SUNRISE_ALTITUDE = 165;
const SUNSET_ALTITUDE = 15;

/**
 * Where the sun parks once the shop is closed: below the horizon, which
 * puts the moon the same distance above it. Night doesn't pass in live
 * ticks (it goes by in one batch when the player drives home), so the dial
 * holds this pose for the whole evening — moon up means closed, go home.
 */
const NIGHT_ALTITUDE = -20;

/** Local coordinates of a body on the orbit, before the group is rotated. */
const SUN_LOCAL = { x: CENTER, y: CENTER - ORBIT_RADIUS };
const MOON_LOCAL = { x: CENTER, y: CENTER + ORBIT_RADIUS };

/** How visible the body currently below the horizon is. */
const BELOW_HORIZON_OPACITY = 0.18;

interface DayDialProps {
  /** How much of the working day has been spent, 0..1 and beyond on overtime. */
  readonly dayProgress: number;
  /** Whether the shop is closed for the night. */
  readonly night: boolean;
  /** For the label — the dial itself never spells this out. */
  readonly phase: DayPhase;
  /** Shop day number, for the label. */
  readonly day: number;
}

export const DayDial: React.FC<DayDialProps> = ({
  dayProgress,
  night,
  phase,
  day,
}) => {
  const progress = Math.min(1, Math.max(0, dayProgress));
  const altitude = night
    ? NIGHT_ALTITUDE
    : SUNRISE_ALTITUDE + progress * (SUNSET_ALTITUDE - SUNRISE_ALTITUDE);

  // The whole orbit is one rotated group, so the browser tweens the sun
  // between ticks instead of stepping it. At the idle creep a tick lands
  // only every twelve seconds, and a jumping sun would read as a bug.
  const rotation = 90 - altitude;
  const date = formatShopDate(day);
  const { month, dayOfMonth } = shopDateParts(day);

  return (
    <div
      className="relative"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={`${phase}, ${date}`}
      data-testid="day-dial"
      data-day-phase={phase}
    >
      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          {/* A crescent, cut by pushing a second disc off-center so it
              spills past the first one's edge. */}
          <mask id="day-dial-moon">
            <circle cx={MOON_LOCAL.x} cy={MOON_LOCAL.y} r={7} fill="white" />
            <circle
              cx={MOON_LOCAL.x + 3.4}
              cy={MOON_LOCAL.y - 2.2}
              r={6.4}
              fill="black"
            />
          </mask>
        </defs>

        {/* The daylight arc: the track the sun covers between the open and
            the close, and the meter for how much of it is spent. */}
        <path
          d={daylightArc()}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="text-paper-manila/20"
        />
        <path
          d={daylightArc()}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          // pathLength normalizes the arc to 100 units, so the dash maths
          // is just the percentage — no arc-length trigonometry.
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - progress * 100}
          className="text-gold transition-[stroke-dashoffset] duration-500 ease-linear"
          data-testid="day-dial-arc"
        />

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${CENTER}px ${CENTER}px`,
            transition: "transform 500ms linear",
          }}
        >
          {/* Both bodies ride the rotating orbit but are turned back
              upright, so the crescent doesn't tumble as the night comes on. */}
          <g
            style={{
              transform: `rotate(${-rotation}deg)`,
              transformOrigin: `${SUN_LOCAL.x}px ${SUN_LOCAL.y}px`,
            }}
            opacity={night ? BELOW_HORIZON_OPACITY : 1}
            className="text-gold-light transition-opacity duration-500"
            data-testid="day-dial-sun"
          >
            <circle
              cx={SUN_LOCAL.x}
              cy={SUN_LOCAL.y}
              r={5.5}
              fill="currentColor"
            />
            {SUN_RAYS.map((angle) => (
              <line
                key={angle}
                x1={SUN_LOCAL.x}
                y1={SUN_LOCAL.y - 8}
                x2={SUN_LOCAL.x}
                y2={SUN_LOCAL.y - 10.5}
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                style={{
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: `${SUN_LOCAL.x}px ${SUN_LOCAL.y}px`,
                }}
              />
            ))}
          </g>
          <g
            style={{
              transform: `rotate(${-rotation}deg)`,
              transformOrigin: `${MOON_LOCAL.x}px ${MOON_LOCAL.y}px`,
            }}
            opacity={night ? 1 : BELOW_HORIZON_OPACITY}
            className="text-paper-manila transition-opacity duration-500"
            data-testid="day-dial-moon"
          >
            <circle
              cx={MOON_LOCAL.x}
              cy={MOON_LOCAL.y}
              r={7}
              fill="currentColor"
              mask="url(#day-dial-moon)"
            />
          </g>
        </g>
      </svg>

      {/* The date sits in HTML rather than SVG <text> so it takes the same
          condensed face and tabular figures as the rest of the top bar.
          Stacked like a calendar page: the month small over the day. */}
      <span
        className="absolute inset-0 flex flex-col items-center justify-center font-condensed uppercase leading-none text-paper-manila"
        data-testid="day-date"
      >
        <span className="text-[0.55rem] font-semibold tracking-[0.12em] text-paper-manila/70">
          {month}
        </span>
        <span className="text-[1rem] font-bold leading-none tabular-nums">
          {dayOfMonth}
        </span>
      </span>
    </div>
  );
};

/** Eight rays, evenly spaced. */
const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

/** The sun's path from the open to the close, swept over the top of the dial. */
function daylightArc(): string {
  const from = orbitPoint(SUNRISE_ALTITUDE);
  const to = orbitPoint(SUNSET_ALTITUDE);
  // Under 180° of sweep, running left to right over the top: small arc,
  // clockwise on screen.
  return `M ${from.x} ${from.y} A ${ORBIT_RADIUS} ${ORBIT_RADIUS} 0 0 1 ${to.x} ${to.y}`;
}

/** A point on the orbit at the given altitude above the horizon, in degrees. */
function orbitPoint(altitudeDegrees: number): { x: number; y: number } {
  const radians = (altitudeDegrees * Math.PI) / 180;
  return {
    x: round(CENTER + ORBIT_RADIUS * Math.cos(radians)),
    y: round(CENTER - ORBIT_RADIUS * Math.sin(radians)),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
