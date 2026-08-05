import { useTick } from "@pixi/react";
import { Container, Ticker } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { footprintCenter, Machine } from "../../game/Machine";
import { camera } from "../shop-view/cameraStore";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { shopFrame } from "../shop-view/shopFrameStore";
import { StageFit } from "./stageMath";

/**
 * The lean-in: opening a bench doesn't cut to the bench view, the camera
 * zooms into it. Both views draw the same bench — same art, same floor,
 * same stock lying where the bench layout says — so the transition is a
 * single similarity transform on the bench view's whole stage: at the
 * start it maps the scene exactly onto the bench's on-screen footprint
 * in the shop view (position, shop scale, and the machine's floor
 * rotation), and it eases to identity as you lean in. Closing runs the
 * same ramp backwards. Pure presentation, the truck's departure roll for
 * benches: no game state, and the world keeps ticking underneath.
 */

/** How long the lean in (or back out) takes. */
export const BENCH_ZOOM_MS = 550;

/**
 * Where the bench sits on screen at shop framing, expressed as the
 * transform that maps the bench view's finished stage onto it: scale
 * (well under 1), the machine's floor angle, and the screen point its
 * center starts from. `pivot` is the bench center in stage px — the
 * frame is centered on the bench, so it's the frame's center — which
 * the transform swings and scales about.
 */
export interface BenchZoomAnchor {
  readonly xPx: number;
  readonly yPx: number;
  readonly scale: number;
  readonly angleDeg: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

export function benchZoomAnchor(
  machine: Machine,
  frameFit: StageFit,
): BenchZoomAnchor | null {
  if (!shopFrame.ready) return null;
  // The machine container's rotation on the shop floor, normalized to
  // the short way around so the un-turning never unwinds 270°.
  const rawAngle = machine.rotation * -90;
  const angleDeg = (((rawAngle % 360) + 540) % 360) - 180 || 0;
  const rad = (rawAngle * Math.PI) / 180;
  // The bench top's center in the machine container's own coordinates
  // (cell centers at integer multiples of PIXELS_PER_CELL — see
  // MachineSprite's FootprintArt), carried through the container's
  // rotation and its seat at the origin cell's center.
  const [fcx, fcy] = footprintCenter(machine.type.cellsOccupied);
  const lx = fcx * PIXELS_PER_CELL;
  const ly = fcy * PIXELS_PER_CELL;
  const wx =
    lx * Math.cos(rad) -
    ly * Math.sin(rad) +
    (machine.position[0] + 0.5) * PIXELS_PER_CELL;
  const wy =
    lx * Math.sin(rad) +
    ly * Math.cos(rad) +
    (machine.position[1] + 0.5) * PIXELS_PER_CELL;
  return {
    xPx: shopFrame.left + shopFrame.offsetX + wx * shopFrame.scale,
    yPx:
      shopFrame.top +
      shopFrame.offsetY +
      (wy - camera.scroll) * shopFrame.scale,
    scale: (PIXELS_PER_INCH * shopFrame.scale) / frameFit.pxPerIn,
    angleDeg,
    pivotX: frameFit.originX + (frameFit.widthIn / 2) * frameFit.pxPerIn,
    pivotY: frameFit.originY + (frameFit.heightIn / 2) * frameFit.pxPerIn,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * The container the whole bench scene renders through, its transform
 * tweened between the shop framing (progress 0) and identity (progress
 * 1). Progress moves toward `target` and is reversible mid-flight — Tab
 * pressed again during the lean-in just rolls it back out from wherever
 * it is. Imperative through the ref, the CameraLayer way: the transform
 * moves every frame and React shouldn't re-render the scene for it.
 */
export const BenchZoomRig: React.FC<{
  anchor: BenchZoomAnchor | null;
  /** 1 leans in to the bench framing, 0 back out to the shop's. */
  target: 0 | 1;
  /** Skip the motion (prefers-reduced-motion, or no shop underneath). */
  instant: boolean;
  /** Fired once each time progress arrives at a target. */
  onRest: (at: 0 | 1) => void;
  children: React.ReactNode;
}> = ({ anchor, target, instant, onRest, children }) => {
  const nodeRef = useRef<Container | null>(null);
  const progress = useRef(instant || !anchor ? target : 1 - target);
  const restedAt = useRef<0 | 1 | null>(null);

  const apply = useCallback(
    (node: Container) => {
      if (!anchor || progress.current === 1) {
        node.position.set(0, 0);
        node.pivot.set(0, 0);
        node.scale.set(1);
        node.angle = 0;
        return;
      }
      const eased = easeInOutCubic(progress.current);
      node.pivot.set(anchor.pivotX, anchor.pivotY);
      node.position.set(
        anchor.xPx + (anchor.pivotX - anchor.xPx) * eased,
        anchor.yPx + (anchor.pivotY - anchor.yPx) * eased,
      );
      // The zoom interpolates in log space — a camera ramp, not a lerp
      node.scale.set(Math.exp(Math.log(anchor.scale) * (1 - eased)));
      node.angle = anchor.angleDeg * (1 - eased);
    },
    [anchor],
  );

  useTick((ticker: Ticker) => {
    const node = nodeRef.current;
    if (!node) return;
    const step =
      instant || !anchor ? 1 : Math.min(ticker.deltaMS, 100) / BENCH_ZOOM_MS;
    progress.current =
      target === 1
        ? Math.min(1, progress.current + step)
        : Math.max(0, progress.current - step);
    apply(node);
    if (progress.current === target && restedAt.current !== target) {
      restedAt.current = target;
      onRest(target);
    }
    if (progress.current !== target) {
      restedAt.current = null;
    }
  });

  // The first paint already wears the starting transform — a ref
  // callback runs before the frame renders, so there's no identity flash
  const attach = useCallback(
    (node: Container | null) => {
      nodeRef.current = node;
      if (node) apply(node);
    },
    [apply],
  );

  return <pixiContainer ref={attach}>{children}</pixiContainer>;
};
