import React from "react";
import { formatShopDate, shopDateParts } from "../game/calendar";
import { sunAltitude } from "../game/daylight";
import { DayPhase } from "../game/time";

/**
 * The clock in the top bar: an open patch of sky with the sun on one side
 * of an invisible disc and the moon on the other, clipped at the horizon
 * so only what is up shows. The disc turns as the day is spent, carrying
 * the sun up and over from the east and finally down through the horizon's
 * edge in the west, where the clip swallows it and lifts the moon in its
 * place. The date sits at the disc's hub — which, with the bottom half cut
 * away, is the bottom center of the dial.
 *
 * Nothing is drawn but the bodies themselves: no disc face, no track, no
 * meter. The sun's position *is* the readout, and a ring behind it only
 * made it look like a gauge to be read off.
 *
 * There is still deliberately no wall clock (see `src/game/time-flow.ts`)
 * — nothing here reads out an hour. What it shows is where the sun stands,
 * which is how the shop tells time everywhere else: high and the day is
 * young, low in the west and you should be thinking about the drive home,
 * gone and the shop is closed.
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
/**
 * The track the bodies ride: far enough out that a rising or setting body
 * sits in the dial's low corners clear of the date at the hub.
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
  // The same sun the shop floor is lit by (`daylight.ts`), so the shadow
  // on the lot can never disagree with the sun drawn up here.
  const altitude = sunAltitude(Math.min(1, Math.max(0, dayProgress)), night);

  // The whole disc is one rotated group, so the browser tweens the sun
  // between ticks instead of stepping it. At the idle creep a tick lands
  // only every twelve seconds, and a jumping sun would read as a bug.
  //
  // Altitude counts counterclockwise from the right-hand horizon while SVG
  // rotation goes clockwise, so this subtraction is also what turns a day's
  // falling altitude into a counterclockwise sweep: east, over the top, west.
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
      // With the arc gone there is nothing in the markup that says where
      // the sun is standing, and where it stands is the whole readout.
      data-sun-altitude={round(altitude)}
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

const round = (n: number) => Math.round(n * 100) / 100;
