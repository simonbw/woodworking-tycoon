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
 * The light at a given moment, as ingredients for one full-screen light
 * mask (see `DaylightLayer`).
 *
 * The mask is built up in light's own terms and composited **once**, by
 * multiplying it over the finished scene. Two consequences worth holding
 * onto, because they're why this shape and not another:
 *
 * - `0xffffff` in the mask means "leave it alone", so **midday is the
 *   neutral case** and every other hour modulates down from it.
 * - Lamps are *added into the mask*, not onto the screen. Multiplying by
 *   a brighter-but-still-capped mask walks a surface back toward its own
 *   unlit color and can never push past it — so a lit driveway is
 *   concrete-colored and brighter, never washed toward white. Adding
 *   light straight to the screen has no such ceiling, which is exactly
 *   what made an earlier additive version of the door spill look like a
 *   pale shape laid on top of the world.
 */
export interface Daylight {
  /** Ambient for everything outdoors: lawn, driveway, truck, walls. */
  outdoorTint: number;
  /**
   * Ambient on the shop floor *before* the lamps. Full daylight while the
   * sun is carrying the room, and genuinely dim after dark — an unlit
   * garage at midnight is dark, and the whole reason the shop stays
   * workable is `lamps`, not an exemption from the night.
   */
  interiorTint: number;
  /** Where the building throws its shadow, and how hard. */
  shadow: DaylightShadow;
  /**
   * How much of the shop's light is coming from its own fixtures rather
   * than through the door: 0 in broad daylight, 1 after close.
   *
   * Two things read this, and they're the same fact seen from either side
   * of the wall. Inside, it's how strongly the room falls off toward its
   * corners — bulbs light a pool, the sun lights everything evenly, so a
   * shop with no falloff at midnight looks like a lightbox. Outside, it's
   * how much of that light escapes through the door onto the driveway.
   */
  lamps: number;
}

export interface DaylightShadow {
  /**
   * Offset from the building, in multiples of the noon shadow's length —
   * so the layer picks the one pixel distance and this stays unitless.
   * Positive x is to the right, positive y down the screen.
   */
  dx: number;
  dy: number;
  /**
   * What to multiply the mask by inside the shadow. `0xffffff` is no
   * shadow at all (night, when there's no sun to block).
   *
   * This is a *color*, not a strength, and that is the whole point. A
   * shadow is not "the light, but less" — it is the ground with the sun
   * taken away and **the sky left behind**. Blocking the sun can never
   * take a surface below what the sky alone gives it, so this tint is
   * floored at {@link SHADOW_SKY} and cannot approach black no matter how
   * hard the sun is. It's blue for the same reason a real shadow is: what
   * remains lighting it is the sky.
   *
   * The earlier version multiplied by black at an alpha, which had no
   * floor — crank the strength and the lawn went to nothing, which is not
   * a shadow, it's a hole.
   */
  tint: number;
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
 * The shop's ambient before its own lights: daylight while the sun is
 * carrying the room, dropping to a cool unlit dimness after dark. It only
 * ever falls this far because {@link LAMP_LIGHT} is about to be added back
 * on top — see {@link interiorUnderLamps}, which is what actually has to
 * stay workable.
 */
const INTERIOR_DAY = 0xffffff;
const INTERIOR_EVENING = 0xfff6e4;
const INTERIOR_NIGHT = 0x6a6f80;

/**
 * What a ceiling fixture adds to the mask at the middle of its pool,
 * falling to nothing at the edge of the throw. Warm, because bulbs are —
 * against the cool unlit ambient, that contrast is most of what makes a
 * shop at night read as *lit* rather than as merely bright.
 *
 * The layer paints the actual gradient; this is the peak, and it lives
 * here so {@link interiorUnderLamps} can hold the renderer to the promise
 * that the shop stays workable.
 */
export const LAMP_LIGHT = 0xb4956a;

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
 * What a surface keeps when the building takes the sun off it: the sky's
 * own contribution, and nothing else. Multiplying by this is the darkest
 * a shadow can ever get — there is no strength setting that walks it to
 * black, because a shadowed lawn is still a lawn under an open sky.
 *
 * Blue on purpose, and by a wide margin: with the sun gone, what's left
 * lighting the grass is a blue sky, which is why real shadows read cool
 * against warm sunlight.
 */
const SHADOW_SKY = 0x8c94b8;

/** A mask multiplier that changes nothing — no shadow here. */
const NO_SHADOW = 0xffffff;

/**
 * How completely the building blocks the sun, against how high it is.
 * A high sun is blocked hard and cleanly; a low one rakes in and the
 * contrast washes out, so the shadow only reaches part way toward
 * {@link SHADOW_SKY}. Never 1 at the ends of the day, never 0 in the
 * middle of it.
 */
const SHADOW_STRENGTH_MAX = 1;
const SHADOW_STRENGTH_MIN = 0.55;

/**
 * Where in the day the shop's own lights start to matter — the point the
 * daylight through the door stops carrying the room on its own.
 */
const LAMPS_START = 0.75;

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
      shadow: {
        dx: 0,
        dy: DOWNWARD * (1 + LOW_SUN_STRETCH),
        tint: NO_SHADOW,
      },
      lamps: 1,
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
      clamp((t - LAMPS_START) / (1 - LAMPS_START)),
    ),
    shadow: {
      // Away from the sun: a sun on the left throws the shadow right.
      dx: -cos * length,
      dy: DOWNWARD * length,
      // Part of the way from "full sun" toward "sky only", never past it.
      tint: mixColors(
        NO_SHADOW,
        SHADOW_SKY,
        SHADOW_STRENGTH_MIN + sin * (SHADOW_STRENGTH_MAX - SHADOW_STRENGTH_MIN),
      ),
    },
    lamps: clamp((t - LAMPS_START) / (1 - LAMPS_START)),
  };
}

/**
 * The shop floor's light in the middle of the lamp pool: the ambient with
 * the fixtures added back, the way the mask composites them.
 *
 * This is the number the "well lit shop" promise is actually about. The
 * ambient alone goes dark at night on purpose, so asserting on it would
 * check the wrong thing — what has to hold is that where the player
 * works, they can see.
 */
export function interiorUnderLamps(light: Daylight): number {
  return addColors(light.interiorTint, scaleColor(LAMP_LIGHT, light.lamps));
}

/** Per-channel add, clamped — the mask's own ceiling, in one place. */
function addColors(a: number, b: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const sum = Math.min(255, ((a >> shift) & 0xff) + ((b >> shift) & 0xff));
    out |= sum << shift;
  }
  return out;
}

/** Dim a color toward black. */
function scaleColor(color: number, factor: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    out |= Math.round(((color >> shift) & 0xff) * clamp(factor)) << shift;
  }
  return out;
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
