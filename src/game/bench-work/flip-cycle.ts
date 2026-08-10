import { MaterialInstance } from "../Materials";
import { BenchPlacement } from "./bench-layout";
import { placedPieceSize } from "./workpiece";

/**
 * The one flip verb, and the tumble that makes it legible.
 *
 * F on a board cycles three stops — flat → up on its long edge → up on
 * its end → flat — and each stop is nothing but a footprint, the one
 * `placedPieceSize` already declares. That makes the whole animation a
 * matter of interpolating between two rows of that table and
 * cross-fading the two sprites that draw them: this module owns the
 * cycle (which stop follows which, what to call it) and the frame math
 * (how big the piece looks partway through), and the bench scene owns
 * only the ticking.
 *
 * Two things are deliberate here.
 *
 * The cycle's stops can't be linked by three honest single-axis tips.
 * Take the board's dimensions as (X, Y, Z): flat is (width, length,
 * thickness), on edge is (thickness, length, width), on end is (width,
 * thickness, length). Flat → edge is a pure roll about the length, and
 * end → flat is a pure tip about the width, but edge → end needs a tip
 * AND a quarter turn to land on the modeled footprint. No reordering of
 * the three fixes that — the yaw is inherent. Animating it honestly
 * would leave a board turned 90° after a full cycle, which is exactly
 * the unpredictability the tumble exists to cure, so the turn is spent
 * inside the leg instead: the shrinking axis leads and the growing one
 * follows (`axisProgress`), which reads as the piece going over and
 * then settling onto its new face. `angleDeg` is never touched, so
 * three presses of F always land a board back where it started.
 *
 * The phase is accumulated, not normalized — the same reasoning
 * `BenchPlacement.angleDeg` gives for accumulating turns. The cycle only
 * ever runs forward, so a stop two steps along (an assembly snap seating
 * a leg straight onto its end) tumbles through the stop between rather
 * than springing backwards through it.
 */

/** One stop in the cycle: the placement flags that put a board there. */
export interface FlipStop {
  readonly onEdge?: boolean;
  readonly onEnd?: boolean;
}

/** The three stops F cycles through, in cycle order. */
export const FLIP_STOPS: ReadonlyArray<FlipStop> = [
  {}, // lying flat
  { onEdge: true }, // up on its long edge
  { onEnd: true }, // up on its end
];

/** What F does next, named for the key hint that offers it. */
export const FLIP_STOP_HINTS: ReadonlyArray<string> = [
  "lay flat",
  "stand on edge",
  "stand on end",
];

/** Which stop this placement is at. */
export function flipStopOf(placement: FlipStop): number {
  if (placement.onEnd) return 2;
  if (placement.onEdge) return 1;
  return 0;
}

/** The stop F moves to from here. */
export function nextFlipStop(stop: number): number {
  return (stop + 1) % FLIP_STOPS.length;
}

/**
 * The placement standing at a given stop. Both flags are written
 * explicitly rather than spread, so leaving a stop clears it — an
 * on-edge board sent to its end must stop being on edge.
 */
export function atFlipStop(
  placement: BenchPlacement,
  stop: number,
): BenchPlacement {
  const target = FLIP_STOPS[stop] ?? FLIP_STOPS[0]!;
  return {
    ...placement,
    onEdge: target.onEdge ?? false,
    onEnd: target.onEnd ?? false,
  };
}

/**
 * Whether F cycles this piece through the three stops at all. Only
 * boards tumble; the pallet's F turns it over instead — a different
 * verb, tweened as a mirror by the scene's transform — and everything
 * else has nothing but a face to show.
 */
export function tumbles(material: MaterialInstance): boolean {
  return material.type === "board";
}

/** The next accumulated phase for a piece that has arrived at `stop`. */
export function advanceFlipPhase(phase: number, stop: number): number {
  const count = FLIP_STOPS.length;
  const current = ((Math.round(phase) % count) + count) % count;
  const delta = (((stop - current) % count) + count) % count;
  return phase + delta;
}

/** Which stop an accumulated phase sits at. */
export function stopAtPhase(phase: number): number {
  const count = FLIP_STOPS.length;
  return ((Math.floor(phase) % count) + count) % count;
}

/** How long one leg of the cycle takes, in seconds. */
export const FLIP_LEG_SECONDS = 0.18;

/** How much the piece swells at the top of its tumble, selling the lift
 * off the bench that a real hand gives it. */
const LIFT = 0.1;

/** How late in the leg the growing axis starts moving. */
const FOLLOW_DELAY = 0.35;

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * How far along its own move one axis is. The axis that shrinks leads
 * on the leg's own clock; the axis that grows waits, so a board going
 * from edge to end tips over before it settles across — see the header.
 */
function axisProgress(from: number, to: number, t: number): number {
  if (to > from) {
    return easeInOut(Math.max(0, (t - FOLLOW_DELAY) / (1 - FOLLOW_DELAY)));
  }
  return easeInOut(t);
}

/** One frame of a tumble: what to draw, how big, and how faded. */
export interface TumbleFrame {
  /** The stop being left, and the one being arrived at. */
  readonly fromStop: number;
  readonly toStop: number;
  /** Raw progress through the leg, 0 at the stop being left. */
  readonly t: number;
  /** The footprint the piece appears to cover right now, in inches. */
  readonly widthIn: number;
  readonly heightIn: number;
  /** Uniform swell, 1 at rest. */
  readonly lift: number;
  /** Cross-fade: the outgoing sprite carries `1 - fade`. */
  readonly fade: number;
}

/**
 * The piece's apparent footprint partway through the cycle. At an
 * integer phase this is exactly `placedPieceSize` of that stop with the
 * outgoing sprite alone on screen, so a piece at rest draws precisely
 * as it always has.
 */
export function tumbleFrame(
  material: MaterialInstance,
  phase: number,
): TumbleFrame {
  const fromStop = stopAtPhase(phase);
  const toStop = nextFlipStop(fromStop);
  const t = phase - Math.floor(phase);
  const from = flipStopSize(material, fromStop);
  const to = flipStopSize(material, toStop);
  const widthIn =
    from.widthIn +
    (to.widthIn - from.widthIn) * axisProgress(from.widthIn, to.widthIn, t);
  const heightIn =
    from.heightIn +
    (to.heightIn - from.heightIn) * axisProgress(from.heightIn, to.heightIn, t);
  return {
    fromStop,
    toStop,
    t,
    widthIn,
    heightIn,
    lift: 1 + LIFT * Math.sin(Math.PI * t),
    fade: easeInOut(t),
  };
}

/** The footprint a piece covers standing at one stop. */
export function flipStopSize(
  material: MaterialInstance,
  stop: number,
): { widthIn: number; heightIn: number } {
  return placedPieceSize(material, FLIP_STOPS[stop] ?? FLIP_STOPS[0]!);
}
