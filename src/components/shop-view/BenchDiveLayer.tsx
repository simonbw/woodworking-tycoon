import { useTick } from "@pixi/react";
import { AlphaFilter, Container } from "pixi.js";
import React, { RefObject, useCallback, useMemo, useRef } from "react";
import {
  BENCH_DIVE_MS,
  BenchSceneSlot,
  benchSceneSlot,
  easeInOutCubic,
  useBenchSceneSlot,
} from "../bench-view/benchSceneSlot";
import { camera } from "./cameraStore";
import { PIXELS_PER_INCH } from "./shop-scale";

/**
 * The lean-in: opening a bench doesn't cut to the bench view, the camera
 * dives into it — the whole shop swells around the bench while the bench
 * scene rides the very same motion, pixel-locked, until it fills the
 * frame. Both pictures live in the one canvas, so the dive is a single
 * similarity ramp computed once per tick and applied to both halves:
 * forward to the world container (scaling the shop up about the bench,
 * panning it to center, un-turning the machine's floor rotation), and
 * inverse to the scene container (mapping the finished scene onto
 * wherever the shop's bench footprint is that frame). Closing runs the
 * same ramp backwards; a Tab-Tab mid-flight just rolls back from
 * wherever progress is. Pure presentation, the truck's departure roll
 * for benches: no game state, and the world keeps ticking underneath.
 *
 * The scene subtree itself is published by BenchWorkSurface (which owns
 * all interaction state and the DOM chrome) through benchSceneSlot.
 * Imperative through refs, the CameraLayer way: the transforms move
 * every frame and React owns none of these properties.
 */

/** Where the dive's ramp stands, advanced on the shop's ticker. */
interface DiveClock {
  benchKey: string | null;
  target: 0 | 1;
  startedAt: number;
  startProgress: number;
  restedAt: 0 | 1 | null;
}

/** The bench-framing anchor, in canvas px at shop framing. */
function diveAnchor(
  slot: BenchSceneSlot,
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  const { group, frameFit } = slot;
  // The frame's rotation on the shop floor, normalized to the short way
  // around so the un-turning never unwinds 270°.
  const rawAngle = group.alignment * -90;
  const angleDeg = (((rawAngle % 360) + 540) % 360) - 180 || 0;
  // The middle of the whole run's tops — a pair of tables dives to the
  // middle of the pair, not the middle of one of them.
  const wx = group.centerInShopIn.xIn * PIXELS_PER_INCH;
  const wy = group.centerInShopIn.yIn * PIXELS_PER_INCH;
  return {
    xPx: offsetX + wx * scale,
    yPx: offsetY + (wy - camera.scroll) * scale,
    scale: (PIXELS_PER_INCH * scale) / frameFit.pxPerIn,
    angleDeg,
    pivotX: frameFit.originX + (frameFit.widthIn / 2) * frameFit.pxPerIn,
    pivotY: frameFit.originY + (frameFit.heightIn / 2) * frameFit.pxPerIn,
  };
}

export const BenchDiveLayer: React.FC<{
  /** The shop's world container (between the fit and camera containers). */
  worldRef: RefObject<Container | null>;
  /** Where the shop floor's origin lands on the canvas, in canvas px. */
  offsetX: number;
  offsetY: number;
  scale: number;
}> = ({ worldRef, offsetX, offsetY, scale }) => {
  const slot = useBenchSceneSlot();
  const sceneRef = useRef<Container | null>(null);
  const clock = useRef<DiveClock>({
    benchKey: null,
    target: 1,
    startedAt: 0,
    startProgress: 0,
    restedAt: null,
  });
  // Flattens the scene before fading so mid-fade the backdrop can't
  // ghost through the boards lying on it — container.alpha multiplies
  // per-primitive, which is exactly the wrong look for a crossfade.
  const alphaFilter = useMemo(() => new AlphaFilter({ alpha: 0 }), []);
  React.useEffect(() => () => alphaFilter.destroy(), [alphaFilter]);

  /** The ramp right now, advancing the clock's marks as the slot moves. */
  const readProgress = useCallback((live: BenchSceneSlot): number => {
    const c = clock.current;
    const now = performance.now();
    if (c.benchKey !== live.benchKey) {
      // A fresh dive starts from the far end of the ramp
      c.benchKey = live.benchKey;
      c.target = live.target;
      c.startProgress = live.target === 1 ? 0 : 1;
      c.startedAt = now;
      c.restedAt = null;
    } else if (c.target !== live.target) {
      // Retargeted mid-flight: roll back from wherever progress is
      c.startProgress = progressAt(c, now, live.instant);
      c.startedAt = now;
      c.target = live.target;
      c.restedAt = null;
    }
    return progressAt(c, now, live.instant);
  }, []);

  const apply = useCallback(
    (live: BenchSceneSlot, progress: number) => {
      const world = worldRef.current;
      const scene = sceneRef.current;
      const eased = easeInOutCubic(progress);
      const anchor = diveAnchor(live, offsetX, offsetY, scale);

      if (world) {
        if (eased === 0) {
          world.position.set(0, 0);
          world.pivot.set(0, 0);
          world.scale.set(1);
          world.angle = 0;
        } else {
          // The anchor speaks canvas px; the world's children live in
          // world px behind the fitted offset and scale.
          const lx = (px: number) => (px - offsetX) / scale;
          const ly = (px: number) => (px - offsetY) / scale;
          world.pivot.set(lx(anchor.xPx), ly(anchor.yPx));
          world.position.set(
            lx(anchor.xPx + (anchor.pivotX - anchor.xPx) * eased),
            ly(anchor.yPx + (anchor.pivotY - anchor.yPx) * eased),
          );
          // The zoom interpolates in log space — a camera ramp, not a lerp
          world.scale.set(Math.exp(-Math.log(anchor.scale) * eased));
          world.angle = -anchor.angleDeg * eased;
        }
      }

      if (scene) {
        if (progress === 1) {
          scene.position.set(0, 0);
          scene.pivot.set(0, 0);
          scene.scale.set(1);
          scene.angle = 0;
        } else {
          scene.pivot.set(anchor.pivotX, anchor.pivotY);
          scene.position.set(
            anchor.xPx + (anchor.pivotX - anchor.xPx) * eased,
            anchor.yPx + (anchor.pivotY - anchor.yPx) * eased,
          );
          scene.scale.set(Math.exp(Math.log(anchor.scale) * (1 - eased)));
          scene.angle = anchor.angleDeg * (1 - eased);
        }
        scene.visible = eased > 0;
        if (eased >= 1) {
          scene.filters = null;
        } else {
          alphaFilter.alpha = eased;
          scene.filters = [alphaFilter];
        }
      }
    },
    [worldRef, offsetX, offsetY, scale, alphaFilter],
  );

  useTick(() => {
    const live = benchSceneSlot();
    const world = worldRef.current;
    if (!live) {
      // No bench open (or it unmounted abruptly — the player drove off
      // mid-lean): the shop draws plain.
      clock.current.benchKey = null;
      if (world) {
        world.position.set(0, 0);
        world.pivot.set(0, 0);
        world.scale.set(1);
        world.angle = 0;
      }
      return;
    }
    const progress = readProgress(live);
    apply(live, progress);
    const c = clock.current;
    if (progress === c.target && c.restedAt !== c.target) {
      c.restedAt = c.target;
      live.onRest(c.target);
    }
    if (progress !== c.target) {
      c.restedAt = null;
    }
  });

  // The first paint already wears the starting transform — a ref
  // callback runs before the frame renders, so there's no identity flash
  const attach = useCallback(
    (node: Container | null) => {
      sceneRef.current = node;
      const live = benchSceneSlot();
      if (node && live) {
        apply(live, readProgress(live));
      }
    },
    [apply, readProgress],
  );

  if (!slot) {
    return null;
  }
  // Keyed by the bench: switching benches remounts the whole scene, so
  // stroke grids and turn springs can't be reconciled across tables.
  return (
    <pixiContainer key={slot.benchKey} ref={attach}>
      {slot.sceneElement}
    </pixiContainer>
  );
};

function progressAt(c: DiveClock, now: number, instant: boolean): number {
  if (instant) return c.target;
  const dt = (now - c.startedAt) / BENCH_DIVE_MS;
  return c.target === 1
    ? Math.min(1, c.startProgress + dt)
    : Math.max(0, c.startProgress - dt);
}
