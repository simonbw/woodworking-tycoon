import { colorToRgb } from "../utils/colorUtils";

/**
 * Per-frame easing for the light.
 *
 * `daylightAt` is a function of the tick, and the tick is coarse: at the
 * idle creep one lands every twelve seconds, and under the wait key they
 * arrive ten a second. Neither is a rate you want to drive a color at
 * directly — the first steps, the second flickers. So every lighting value
 * is a target the renderer chases at its own steady pace, which also gets
 * the jump into and out of night for free: dusk is a hard edge in the
 * model (the clock stops at close) and a two-second fade on screen.
 */

/** How long the light takes to cover most of the distance to its target. */
const EASE_SECONDS = 1.2;

/**
 * The share of the remaining distance to close this frame. Exponential, so
 * the result is the same whether the frame took 8ms or 60 — a lighting
 * fade must not run faster on a faster machine.
 */
export function easeFraction(deltaMS: number): number {
  // A long frame (tab in the background, a GC pause) would otherwise snap
  // the whole way in one step and show as a flash.
  const dt = Math.min(deltaMS, 100) / 1000;
  return 1 - Math.exp(-dt / EASE_SECONDS);
}

/** A color being eased, held unpacked so rounding doesn't accumulate. */
export interface EasedColor {
  r: number;
  g: number;
  b: number;
}

export function easedColor(hex: number): EasedColor {
  const [r, g, b] = colorToRgb(hex);
  return { r, g, b };
}

/** An eased color as PIXI wants it, without stepping it. */
export function packed(c: EasedColor): number {
  return (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
}

/**
 * Step `current` toward `target` and return it packed for PIXI's `tint`.
 * Mutates `current`, which is the point — it lives in a ref across frames.
 */
export function stepColor(
  current: EasedColor,
  target: number,
  t: number,
): number {
  const [r, g, b] = colorToRgb(target);
  current.r += (r - current.r) * t;
  current.g += (g - current.g) * t;
  current.b += (b - current.b) * t;
  return packed(current);
}
