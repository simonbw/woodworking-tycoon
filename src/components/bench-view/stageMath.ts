import { WorkSurfaceSize } from "../../game/bench-work/workpiece";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

/**
 * The bench stage: a fixed-size canvas the workpiece is fitted into,
 * zoomed well past the shop view's 4 px/inch — leaning over the bench.
 * All pointer work happens in workpiece inches; these helpers own the
 * mapping so every surface component shares one idea of where the wood
 * is.
 */
export const STAGE_WIDTH = 460;
export const STAGE_HEIGHT = 320;

/** Padding kept around the workpiece so edges stay strokable. */
const STAGE_MARGIN = 36;

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

/** Fit a workpiece (inches) into the stage, centered. */
export function fitToStage(size: WorkSurfaceSize): StageFit {
  const pxPerIn = Math.min(
    (STAGE_WIDTH - STAGE_MARGIN * 2) / size.widthIn,
    (STAGE_HEIGHT - STAGE_MARGIN * 2) / size.heightIn,
    40,
  );
  return {
    pxPerIn,
    spriteScale: pxPerIn / PIXELS_PER_INCH,
    originX: (STAGE_WIDTH - size.widthIn * pxPerIn) / 2,
    originY: (STAGE_HEIGHT - size.heightIn * pxPerIn) / 2,
    widthIn: size.widthIn,
    heightIn: size.heightIn,
  };
}

/** A DOM pointer event's position in workpiece inches. */
export function pointerToInches(
  fit: StageFit,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { xIn: number; yIn: number } {
  const scaleX = rect.width / STAGE_WIDTH;
  const scaleY = rect.height / STAGE_HEIGHT;
  return {
    xIn:
      (clientX - rect.left) / scaleX / fit.pxPerIn - fit.originX / fit.pxPerIn,
    yIn:
      (clientY - rect.top) / scaleY / fit.pxPerIn - fit.originY / fit.pxPerIn,
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
