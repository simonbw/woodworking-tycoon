import { mixColors } from "../utils/colorUtils";
import { clamp, degToRad } from "../utils/mathUtils";

/**
 * Where the sun is, and what that does to the light.
 *
 * One sun serves two places: the top bar's dial draws it literally
 * (`DayDial`), and the shop floor is lit by it (`DaylightLayer`,
 * `EnvironmentLayer`'s building shadow). They share `sunAltitude` so the
 * shadow on the lot always agrees with the sun on the dial — a shadow
 * pointing the wrong way against a sun the player can see is exactly the
 * kind of thing that reads as broken.
 *
 * Everything here is a pure function of how much of the working day has
 * been spent, so it is testable without a renderer and costs nothing to
 * call per frame. Pixel distances live in the layer; this module speaks in
 * degrees, unit vectors, and colors.
 */

/**
 * Where the sun sits at the open and at the close, as degrees above the
 * horizon: 0° is due horizon, 90° overhead. It rises and sets a little way
 * above the horizon rather than exactly on it, so the first and last hours
 * of the day still read as daylight.
 */
export const SUNRISE_ALTITUDE = 165;
export const SUNSET_ALTITUDE = 15;

/**
 * Where the sun parks once the shop is closed: below the horizon, which on
 * the dial puts the moon the same distance above it. Night doesn't pass in
 * live ticks — it goes by in one batch when the player drives home — so
 * this is a held pose, not a position the sun travels through.
 */
export const NIGHT_ALTITUDE = -20;

/**
 * The sun's altitude right now, in degrees. `dayProgress` is the share of
 * the working day spent (`dayTicksSpent / TICKS_PER_DAY`); overtime past
 * 1 is clamped, since by then the shop is closed and `night` decides.
 */
export function sunAltitude(dayProgress: number, night: boolean): number {
  if (night) return NIGHT_ALTITUDE;
  const t = clamp(dayProgress);
  return SUNRISE_ALTITUDE + t * (SUNSET_ALTITUDE - SUNRISE_ALTITUDE);
}

/**
 * The light at a given moment. Both tints are **multiplied** into what is
 * already on screen, so `0xffffff` means "leave it alone" — midday is the
 * neutral case and every other hour tints down from it.
 */
export interface Daylight {
  /** Multiply tint for everything outdoors: lawn, driveway, truck, walls. */
  outdoorTint: number;
  /**
   * Multiply tint for the shop floor. Barely moves: the lights are on in
   * there, so the shop stays workable at every hour and only picks up the
   * warmth of bulbs instead of sun.
   */
  interiorTint: number;
  /** Where the building throws its shadow, and how hard. */
  shadow: DaylightShadow;
  /**
   * How much warm light spills out the garage door onto the driveway,
   * 0 (broad daylight, invisible) to 1 (night, the only light out there).
   */
  spill: number;
}

export interface DaylightShadow {
  /**
   * Offset from the building, in multiples of the noon shadow's length —
   * so the layer picks the one pixel distance and this stays unitless.
   * Positive x is to the right, positive y down the screen.
   */
  dx: number;
  dy: number;
  /** 0 at night, when there is no sun to cast one. */
  alpha: number;
}

/**
 * The daylight ramp, as multiply tints against the hour.
 *
 * The shop opens at 7 AM in June, which is well after sunrise — the
 * morning is *bright*, only a little cool, and the ramp says so. What
 * moves over the day is color far more than brightness: neutral through
 * the middle (the art's own colors, untouched), then warming through gold
 * into the low orange of the last hour before close. Only night actually
 * takes the light away.
 *
 * These are multiplied over ground textures that are already knocked well
 * down (`LAWN_TINT`), so there is much less headroom below than the
 * numbers suggest: a tint that looks like a gentle dusk on paper renders
 * as near-black on the lawn.
 */
const OUTDOOR_RAMP: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0xc9d2e8],
  [0.12, 0xeceaea],
  [0.32, 0xffffff],
  [0.62, 0xfff4e2],
  [0.85, 0xffce92],
  [1.0, 0xe8975c],
];

/**
 * Night: blue and well down from daylight, but deliberately not black.
 * The moon is up on the dial, so the lot should read as a lawn at night
 * rather than as a hole in the world.
 */
const NIGHT_OUTDOOR = 0x6b7fbe;

/**
 * Indoors barely moves, and what movement there is reads as bulbs rather
 * than sun: a touch warm and a touch down from white once the daylight
 * through the door stops carrying the room.
 */
const INTERIOR_DAY = 0xffffff;
const INTERIOR_EVENING = 0xfff6e4;
const INTERIOR_NIGHT = 0xfbeed3;

/**
 * How much longer a low sun's shadow gets. At noon the shadow is one unit;
 * near the horizon it stretches to roughly three and a half.
 */
const LOW_SUN_STRETCH = 2.2;

/**
 * How far a shadow reaches down the screen against how far it reaches
 * sideways. The view looks down on the lot from slightly south, so a
 * shadow always falls a little toward the camera and swings across it —
 * it never points straight up the screen at any hour.
 */
const DOWNWARD = 0.42;

/**
 * Shadow strength: hard and dark under a high sun, weaker as it drops.
 * Both are well up from what looks reasonable in the abstract, because the
 * lawn this falls on is already dark — a tenth of black over it is a
 * change of three values out of 255, which is invisible next to the grass
 * texture's own noise.
 */
const SHADOW_ALPHA_MAX = 0.45;
const SHADOW_ALPHA_MIN = 0.25;

/** Where in the day the door's spill starts to show against the sky. */
const SPILL_STARTS = 0.75;

/** The light at this moment of this day. */
export function daylightAt(dayProgress: number, night: boolean): Daylight {
  const altitude = sunAltitude(dayProgress, night);
  const sin = Math.sin(degToRad(altitude));
  const cos = Math.cos(degToRad(altitude));

  if (night) {
    return {
      outdoorTint: NIGHT_OUTDOOR,
      interiorTint: INTERIOR_NIGHT,
      // No sun, no shadow. The offset still points somewhere sensible so
      // that a tween into or out of night has somewhere to travel.
      shadow: { dx: 0, dy: DOWNWARD * (1 + LOW_SUN_STRETCH), alpha: 0 },
      spill: 1,
    };
  }

  const t = clamp(dayProgress);
  // Long at the ends of the day, short at noon.
  const length = 1 + (1 - sin) * LOW_SUN_STRETCH;

  return {
    outdoorTint: sampleRamp(OUTDOOR_RAMP, t),
    interiorTint: mixColors(
      INTERIOR_DAY,
      INTERIOR_EVENING,
      clamp((t - SPILL_STARTS) / (1 - SPILL_STARTS)),
    ),
    shadow: {
      // Away from the sun: a sun on the left throws the shadow right.
      dx: -cos * length,
      dy: DOWNWARD * length,
      alpha: SHADOW_ALPHA_MIN + sin * (SHADOW_ALPHA_MAX - SHADOW_ALPHA_MIN),
    },
    spill: clamp((t - SPILL_STARTS) / (1 - SPILL_STARTS)),
  };
}

/** Read a color off a sorted list of (position, color) stops. */
function sampleRamp(
  ramp: ReadonlyArray<readonly [number, number]>,
  t: number,
): number {
  if (t <= ramp[0][0]) return ramp[0][1];
  for (let i = 1; i < ramp.length; i++) {
    const [at, color] = ramp[i];
    if (t <= at) {
      const [prevAt, prevColor] = ramp[i - 1];
      const span = at - prevAt;
      return mixColors(prevColor, color, span === 0 ? 0 : (t - prevAt) / span);
    }
  }
  return ramp[ramp.length - 1][1];
}
