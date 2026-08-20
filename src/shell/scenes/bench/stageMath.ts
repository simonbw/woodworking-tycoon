import { WorkSurfaceSize } from "../../../game/bench-work/workpiece";
import { PIXELS_PER_INCH } from "../../../views/shop-scale";

/**
 * The bench stage: the measured canvas the workpiece is fitted into,
 * zoomed well past the shop view's 4 px/inch — leaning over the bench.
 * The canvas takes whatever size the sheet gives it (measured by the
 * wrapper, rendered at device resolution — no CSS upscale, no blur), so
 * every fit is computed from real pixels. All pointer work happens in
 * workpiece inches; these helpers own the mapping so every surface
 * component shares one idea of where the wood is.
 */

/** The rectangle of the canvas a workpiece may occupy, in stage px. */
export interface StageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Padding kept around the frame so its edges stay strokable. Slim,
 * because the caller has already reserved the bands its chrome floats
 * in and the frame carries its own margin in inches — this is the last
 * few pixels of grab room, not the breathing space.
 */
const STAGE_MARGIN = 16;

/** Leaning in only goes so far — cap the zoom for tiny pieces. */
const MAX_PX_PER_IN = 40;

export interface StageFit {
  /** Pixels per workpiece inch at this zoom. */
  readonly pxPerIn: number;
  /** Scale factor for material sprites (drawn at PIXELS_PER_INCH). */
  readonly spriteScale: number;
  /** The workpiece's top-left corner on the stage, in pixels. */
  readonly originX: number;
  readonly originY: number;
  readonly widthIn: number;
  readonly heightIn: number;
}

/** Fit a workpiece (inches) into a stage rectangle, centered. */
export function fitToStage(size: WorkSurfaceSize, rect: StageRect): StageFit {
  const pxPerIn = Math.min(
    (rect.width - STAGE_MARGIN * 2) / size.widthIn,
    (rect.height - STAGE_MARGIN * 2) / size.heightIn,
    MAX_PX_PER_IN,
  );
  return {
    pxPerIn,
    spriteScale: pxPerIn / PIXELS_PER_INCH,
    originX: rect.x + (rect.width - size.widthIn * pxPerIn) / 2,
    originY: rect.y + (rect.height - size.heightIn * pxPerIn) / 2,
    widthIn: size.widthIn,
    heightIn: size.heightIn,
  };
}

/**
 * A DOM pointer event's position in workpiece inches. The canvas renders
 * at its CSS size (autoDensity), so client px map 1:1 onto stage px.
 */
export function pointerToInches(
  fit: StageFit,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { xIn: number; yIn: number } {
  return {
    xIn: (clientX - rect.left - fit.originX) / fit.pxPerIn,
    yIn: (clientY - rect.top - fit.originY) / fit.pxPerIn,
  };
}

/**
 * Per-cell accumulation for one stroke event: the tool's coverage rate
 * enforced against how far the pointer actually moved. A slow, deliberate
 * stroke saturates as it goes (capped at 1); a fast scrub spreads the
 * same work thin and needs more passes — which is exactly the feel the
 * tool tiers buy (see OperationInteraction.coveragePerSecond).
 */
export function strokeGain(
  coveragePerSecond: number,
  radiusIn: number,
  distanceIn: number,
  dtMs: number,
): number {
  const sweptArea = Math.max(distanceIn, 0.01) * radiusIn * 2;
  const workBudget = (coveragePerSecond * Math.min(dtMs, 100)) / 1000;
  // Stamps along the segment overlap ~4× at half-radius spacing
  return Math.min(1, workBudget / sweptArea) / 4;
}

/**
 * Per-cell accumulation for one frame of a powered tool resting in
 * place: the same coverage rate spent over the pad's own footprint
 * instead of a swept band — the orbit sander cutting the spot it sits
 * on. Halved because a zero-length stampStroke lands the point twice.
 */
export function dwellGain(
  coveragePerSecond: number,
  radiusIn: number,
  dtMs: number,
): number {
  const padArea = Math.PI * radiusIn * radiusIn;
  const workBudget = (coveragePerSecond * Math.min(dtMs, 100)) / 1000;
  return Math.min(1, workBudget / padArea) / 2;
}

/**
 * The tween the pieces turn with: the spring the old scene ran (tension
 * 300, friction 26) — a hand turning the piece, no bounce. Steps one
 * value toward its target and snaps when it's close enough to be done.
 */
export function stepTurnSpring(
  value: number,
  velocity: number,
  target: number,
  dt: number,
): [number, number] {
  const nextVelocity = velocity + (300 * (target - value) - 26 * velocity) * dt;
  const next = value + nextVelocity * dt;
  return Math.abs(target - next) < 0.01 && Math.abs(nextVelocity) < 0.05
    ? [target, 0]
    : [next, nextVelocity];
}
