import React from "react";
import { formatShopDate, shopDateParts } from "../game/calendar";
import {
  sunAltitude,
  SUNRISE_ALTITUDE,
  SUNSET_ALTITUDE,
} from "../game/daylight";
import { DayPhase } from "../game/time";

/**
 * The clock in the top bar: a spinning disc with the sun on one side and
 * the moon on the other, clipped at the horizon so only the top half
 * shows. The disc turns as the day is spent, carrying the sun up and
 * over and finally down through the horizon's edge, where the clip
 * swallows it and lifts the moon in its place. The date sits at the
 * disc's hub — which, with the bottom half cut away, is the bottom
 * center of the dial.
 *
 * There is still deliberately no wall clock (see `docs/time-and-days.md`)
 * — nothing here reads out an hour. What it shows is where the sun stands,
 * which is how the shop tells time everywhere else: high and the day is
 * young, low on the right and you should be thinking about the drive home,
 * gone and the shop is closed.
 *
 * The daylight arc doubles as the day's progress meter — it fills from
 * sunrise to wherever the sun has got to — which is what the top bar's
 * gold hairline used to do on its own.
 */

/**
 * SVG user units. The box is a half-disc: full width, half height, with
 * the disc's center on the middle of the bottom edge. Everything below
 * that edge is clipped by the SVG viewport itself — that clip is what
 * hides whichever body is below the horizon.
 */
const BOX_W = 80;
const BOX_H = 40;
const CENTER = { x: BOX_W / 2, y: BOX_H };
/** The disc's face, kept just inside the box. */
const DISC_RADIUS = 38;
/**
 * The track the bodies ride: near the rim, and far enough out that a
 * rising or setting body sits in the disc's low corners clear of the
 * date at the hub.
 */
const ORBIT_RADIUS = 29;
/** The size the dial renders at in CSS pixels. */
const SIZE_W = 72;
const SIZE_H = (SIZE_W * BOX_H) / BOX_W;

/** Local coordinates of a body on the orbit, before the group is rotated. */
const SUN_LOCAL = { x: CENTER.x, y: CENTER.y - ORBIT_RADIUS };
const MOON_LOCAL = { x: CENTER.x, y: CENTER.y + ORBIT_RADIUS };

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
  // The same sun the shop floor is lit by (`daylight.ts`), so the shadow
  // on the lot can never disagree with the sun drawn up here.
  const altitude = sunAltitude(progress, night);

  // The whole disc is one rotated group, so the browser tweens the sun
  // between ticks instead of stepping it. At the idle creep a tick lands
  // only every twelve seconds, and a jumping sun would read as a bug.
  const rotation = 90 - altitude;
  const date = formatShopDate(day);
  const { month, dayOfMonth } = shopDateParts(day);

  return (
    <div
      className="relative"
      style={{ width: SIZE_W, height: SIZE_H }}
      role="img"
      aria-label={`${phase}, ${date}`}
      data-testid="day-dial"
      data-day-phase={phase}
    >
      {/* No overflow-visible here on purpose: the viewport IS the horizon,
          and whatever the disc turns below it is gone. */}
      <svg
        viewBox={`0 0 ${BOX_W} ${BOX_H}`}
        className="absolute inset-0 h-full w-full"
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

        {/* The disc's visible face: a faint half-moon of surface for the
            bodies to ride across, flat edge on the horizon. */}
        <path
          d={discFace()}
          fill="currentColor"
          className="text-paper-manila/10"
        />

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
            transformOrigin: `${CENTER.x}px ${CENTER.y}px`,
            transition: "transform 500ms linear",
          }}
        >
          {/* Both bodies ride the spinning disc but are turned back
              upright, so the crescent doesn't tumble as the night comes on.
              Neither fades: the horizon clip is what hides the one whose
              side of the disc is down. */}
          <g
            style={{
              transform: `rotate(${-rotation}deg)`,
              transformOrigin: `${SUN_LOCAL.x}px ${SUN_LOCAL.y}px`,
            }}
            className="text-gold-light"
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
            className="text-paper-manila"
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
          One line at the disc's hub, on the horizon. */}
      <span
        className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-0.5 font-condensed uppercase leading-none text-paper-manila"
        data-testid="day-date"
      >
        <span className="text-[0.55rem] font-semibold tracking-[0.08em] text-paper-manila/70">
          {month}
        </span>
        <span className="text-[0.8rem] font-bold leading-none tabular-nums">
          {dayOfMonth}
        </span>
      </span>
    </div>
  );
};

/** Eight rays, evenly spaced. */
const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

/** The disc's visible half: a semicircle sitting flat on the horizon. */
function discFace(): string {
  return [
    `M ${CENTER.x - DISC_RADIUS} ${CENTER.y}`,
    `A ${DISC_RADIUS} ${DISC_RADIUS} 0 0 1 ${CENTER.x + DISC_RADIUS} ${CENTER.y}`,
    "Z",
  ].join(" ");
}

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
    x: round(CENTER.x + ORBIT_RADIUS * Math.cos(radians)),
    y: round(CENTER.y - ORBIT_RADIUS * Math.sin(radians)),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
