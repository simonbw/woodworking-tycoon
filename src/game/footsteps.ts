/**
 * When the player's next footfall lands.
 *
 * Footsteps are driven by *distance*, not by a timer: the body covers a
 * stride's worth of floor and a foot comes down. That way the cadence
 * follows walking speed for free — wading through deep sawdust or dragging
 * the shop vac slows the walk (`playerWalkSpeed`), and the steps slow with
 * it without knowing anything about why.
 *
 * Pure, so the cadence is unit-testable without PIXI, React, or Web Audio.
 * `FootstepSoundLayer` samples the body each frame and plays a clip
 * whenever this says a foot landed.
 */

import { Vector } from "./Vectors";

/**
 * Floor covered between one footfall and the next, in cells (feet). A real
 * stride is a bit under 3 feet; at `BASE_WALK_SPEED` this lands around
 * three steps a second, which reads as the brisk walk the body actually
 * moves at.
 */
export const STRIDE_LENGTH = 2.8;

/**
 * Largest distance one sample may contribute. A body teleported across the
 * shop (a loaded save, an E2E fixture) must not pay out a burst of steps,
 * and neither should the frame after a tab-switch hitch. Below one stride,
 * so at most one foot can land per sample.
 */
const MAX_SAMPLE_DISTANCE = 1;

export interface FootstepCadence {
  /** Floor covered since the last footfall, in cells. */
  readonly sinceLastStep: number;
  /** Whether the body was moving at the previous sample. */
  readonly wasMoving: boolean;
}

export const initialFootstepCadence: FootstepCadence = {
  sinceLastStep: 0,
  wasMoving: false,
};

export interface FootstepSample {
  readonly cadence: FootstepCadence;
  /** True when a foot landed on this sample. */
  readonly stepped: boolean;
}

/**
 * Advance the cadence by one sample of the body's motion.
 *
 * Setting off from a standstill lands a step immediately — press a key and
 * you hear yourself leave, rather than a stride's worth of silent gliding.
 * Standing still resets the accumulator, so a shuffle of short taps doesn't
 * bank distance toward a phantom step.
 */
export function advanceFootstepCadence(
  cadence: FootstepCadence,
  distance: number,
  moving: boolean,
): FootstepSample {
  if (!moving) {
    return { cadence: initialFootstepCadence, stepped: false };
  }
  if (!cadence.wasMoving) {
    return { cadence: { sinceLastStep: 0, wasMoving: true }, stepped: true };
  }

  const travelled =
    cadence.sinceLastStep +
    Math.min(Math.max(distance, 0), MAX_SAMPLE_DISTANCE);
  if (travelled < STRIDE_LENGTH) {
    return {
      cadence: { sinceLastStep: travelled, wasMoving: true },
      stepped: false,
    };
  }
  return {
    cadence: { sinceLastStep: travelled - STRIDE_LENGTH, wasMoving: true },
    stepped: true,
  };
}

/** Straight-line distance between two body positions, in cells. */
export function distanceBetween(from: Vector, to: Vector): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
}
