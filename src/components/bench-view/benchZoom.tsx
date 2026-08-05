import { useTick } from "@pixi/react";
import { Container } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { footprintCenter, Machine } from "../../game/Machine";
import { camera } from "../shop-view/cameraStore";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { shopFrame } from "../shop-view/shopFrameStore";
import { StageFit } from "./stageMath";

/**
 * The lean-in: opening a bench doesn't cut to the bench view, the camera
 * dives into it — the whole shop swells around the bench while the bench
 * scene rides the very same motion, pixel-locked, until it fills the
 * frame. Both views draw the same bench from the same state, so the
 * entire transition is one similarity ramp evaluated twice: the shop's
 * world container applies it forward (BenchZoomCameraLayer scales the
 * world up about the bench, panning it to center and un-turning the
 * machine's floor rotation), and the bench view's stage applies what's
 * left of it (BenchZoomRig maps the finished scene onto wherever the
 * shop's bench footprint is that frame). Closing runs the same ramp
 * backwards. Pure presentation, the truck's departure roll for benches:
 * no game state, and the world keeps ticking underneath.
 *
 * The two canvases render on separate tickers, so the progress is a
 * clock, not an integration: both sides evaluate `benchZoomProgress()`
 * from the same start mark and can never drift apart. The shared stage
 * lives in a mutable store (`benchZoomStage`) in the truckStageStore
 * family — written by the bench view, read per-frame by the shop.
 */

/** How long the lean in (or back out) takes. */
export const BENCH_ZOOM_MS = 650;

/**
 * Where the bench sits on screen at shop framing, expressed as the
 * transform that maps the bench view's finished stage onto it: scale
 * (well under 1), the machine's floor angle, and the screen point its
 * center starts from. `pivot` is the bench center in stage px — the
 * frame is centered on the bench, so it's the frame's center — which
 * the transform swings and scales about. The shop side reads the same
 * anchor the other way around: its world dives from `xPx/yPx` toward
 * `pivot` at scale `1/scale`, un-turning `angleDeg`.
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
  const angleDeg = ((((rawAngle % 360) + 540) % 360) - 180) || 0;
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

/** The shared ramp: progress 0 is shop framing, 1 is bench framing. */
export const benchZoomStage = {
  /** Null whenever no bench view is mounted — the shop draws plain. */
  anchor: null as BenchZoomAnchor | null,
  /** Reduced motion: both sides snap to the target, no ramp. */
  instant: false,
  target: 1 as 0 | 1,
  /** The mark the clock runs from (performance.now()). */
  startedAt: 0,
  startProgress: 0,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Where the ramp is right now, on the shared clock. */
export function benchZoomProgress(now = performance.now()): number {
  const s = benchZoomStage;
  if (!s.anchor || s.instant) return s.target;
  const dt = (now - s.startedAt) / BENCH_ZOOM_MS;
  return s.target === 1
    ? Math.min(1, s.startProgress + dt)
    : Math.max(0, s.startProgress - dt);
}

/** Retarget the ramp; reversible mid-flight — the clock restarts from
 * wherever progress is this instant, so a Tab-Tab just rolls back. */
export function setBenchZoomTarget(target: 0 | 1): void {
  const s = benchZoomStage;
  if (s.target === target) return;
  s.startProgress = benchZoomProgress();
  s.startedAt = performance.now();
  s.target = target;
}

/** The bench view is (un)mounted: the shop's camera layer engages or
 * stands down. Engaging starts the clock from the far end of the ramp;
 * React surfaces watching activity get poked on the flip. */
export function setBenchZoomAnchor(anchor: BenchZoomAnchor | null): void {
  const wasActive = benchZoomStage.anchor !== null;
  benchZoomStage.anchor = anchor;
  if (!wasActive && anchor) {
    benchZoomStage.startProgress = benchZoomStage.target === 1 ? 0 : 1;
    benchZoomStage.startedAt = performance.now();
  }
  if (wasActive !== (anchor !== null)) notify();
}

export function subscribeBenchZoom(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the dive is on (bench view mounted), as React state. */
export function useBenchZoomActive(): boolean {
  return React.useSyncExternalStore(
    subscribeBenchZoom,
    () => benchZoomStage.anchor !== null,
  );
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * The container the whole bench scene renders through, its transform
 * riding the shared ramp between the shop framing (progress 0) and
 * identity (progress 1). This is the half of the dive the bench canvas
 * performs; BenchZoomCameraLayer performs the shop's half from the same
 * clock, so the scene stays glued to the swelling shop bench under it.
 * Imperative through the ref, the CameraLayer way: the transform moves
 * every frame and React shouldn't re-render the scene for it.
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
  const restedAt = useRef<0 | 1 | null>(null);

  // The store carries this surface's ramp while it's mounted: anchor
  // and instant refresh every commit (the anchor recomputes with the
  // fit), the target retargets the clock only when it actually flips.
  React.useEffect(() => {
    benchZoomStage.instant = instant;
    setBenchZoomTarget(target);
    setBenchZoomAnchor(anchor);
  });
  React.useEffect(
    () => () => {
      setBenchZoomAnchor(null);
      // The next surface opens fresh
      benchZoomStage.target = 1;
    },
    [],
  );

  const apply = useCallback(
    (node: Container, progress: number) => {
      if (!anchor || progress === 1) {
        node.position.set(0, 0);
        node.pivot.set(0, 0);
        node.scale.set(1);
        node.angle = 0;
        return;
      }
      const eased = easeInOutCubic(progress);
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

  useTick(() => {
    const node = nodeRef.current;
    if (!node) return;
    // The clock only runs once the store knows this surface exists —
    // before the first commit, hold the starting frame.
    const progress =
      benchZoomStage.anchor === null && !instant
        ? 1 - target
        : benchZoomProgress();
    apply(node, progress);
    if (progress === target && restedAt.current !== target) {
      restedAt.current = target;
      onRest(target);
    }
    if (progress !== target) {
      restedAt.current = null;
    }
  });

  // The first paint already wears the starting transform — a ref
  // callback runs before the frame renders, so there's no identity flash
  const attach = useCallback(
    (node: Container | null) => {
      nodeRef.current = node;
      if (node) {
        apply(
          node,
          benchZoomStage.anchor === null && !instant
            ? 1 - target
            : benchZoomProgress(),
        );
      }
    },
    [apply, instant, target],
  );

  return <pixiContainer ref={attach}>{children}</pixiContainer>;
};
