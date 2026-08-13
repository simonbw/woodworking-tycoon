import { useTick } from "@pixi/react";
import { Container, Ticker } from "pixi.js";
import React, { RefObject } from "react";
import { camera } from "./cameraStore";
import { playerMotion } from "../world-view/playerMotionStore";
import { TRIP_TRANSITIONS_DISABLED } from "../trip/TripTransitionLayer";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Follows the player out the garage door. Indoors the camera is exactly
 * the fitted, centered framing ShopView computes — this layer holds the
 * scroll at zero, so nothing about the interior view changed. The moment
 * the player steps past the south wall the target changes character: it
 * centers them in the viewport instead of hugging the building, clamped
 * so the view never scrolls above the interior framing or past the
 * walkable lot's bottom edge. The easing carries the handoff between the
 * two regimes.
 *
 * A venue drawn at a fixed zoom rather than a fitted one (the store) has
 * a world wider and taller than the screen: it passes `scrollStartY=-1`
 * so the camera follows everywhere, plus the horizontal range — the shop
 * leaves the X axis alone and it stays pinned at the fit.
 *
 * Applies the scroll imperatively — the world container and the DOM
 * overlay both move through refs, not React state — because the camera
 * moves every frame and neither side should re-render for it. React owns
 * neither target's `y`/`transform`, so re-renders can't fight the tick.
 */
const FOLLOW_RATE = 5;

export const CameraLayer: React.FC<{
  worldRef: RefObject<Container | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  /** Player cell y where the outdoors begins: the building's south wall.
   * A venue whose floor is taller than the screen (the store) passes -1:
   * the camera then follows the player everywhere, indoors included. */
  scrollStartY: number;
  /** Furthest the view scrolls, in world pixels (0 on a viewport tall
   * enough to see the whole lot). */
  scrollMax: number;
  /** Nearest the view scrolls, in world pixels. 0 (the fitted framing)
   * unless the world's top hangs above the viewport — a centered fit of
   * a too-tall world puts the origin off screen, and reaching the back
   * wall means scrolling above the framing (negative). */
  scrollMin?: number;
  /** The horizontal range, in world pixels. Both default to 0: a world
   * that fits across the screen never pans. */
  scrollMinX?: number;
  scrollMaxX?: number;
  /** Where the shop floor's origin lands on the canvas, in screen px. */
  offsetX?: number;
  offsetY: number;
  /** The canvas size, in screen px. */
  viewWidth?: number;
  viewHeight: number;
  scale: number;
}> = ({
  worldRef,
  overlayRef,
  scrollStartY,
  scrollMax,
  scrollMin = 0,
  scrollMinX = 0,
  scrollMaxX = 0,
  offsetX = 0,
  offsetY,
  viewWidth = 0,
  viewHeight,
  scale,
}) => {
  // A fresh scene starts unscrolled. The scroll is a singleton and the
  // store's floor drives the same camera (StoreView), so whatever value
  // the last venue left behind must not carry into this one's framing.
  React.useEffect(() => {
    camera.scroll = 0;
    camera.scrollX = 0;
  }, []);

  // The first frame snaps rather than eases: at mount the scroll is
  // whatever the reset left, and gliding from there to wherever the body
  // just snapped (a trip arrival, a reload mid-aisle) is a swoop across
  // the world nobody asked for.
  const firstFrame = React.useRef(true);

  useTick((ticker: Ticker) => {
    // The scroll that would put the player at the middle of the screen.
    const playerYPx = playerMotion.pos[1] * PIXELS_PER_CELL;
    const playerXPx = playerMotion.pos[0] * PIXELS_PER_CELL;
    const centered = playerYPx - (viewHeight / 2 - offsetY) / scale;
    const centeredX = playerXPx - (viewWidth / 2 - offsetX) / scale;
    const outdoors = playerMotion.pos[1] > scrollStartY;
    const target = outdoors
      ? Math.min(Math.max(centered, scrollMin), scrollMax)
      : scrollMin;
    const targetX = Math.min(Math.max(centeredX, scrollMinX), scrollMaxX);

    // Ease with the same hitch clamp the body uses, then snap the last
    // fraction of a pixel so a settled camera writes a settled number.
    // The E2E build skips the glide (the same flag that skips the trip
    // performances): specs teleport across the world and click the next
    // frame, and a camera mid-ease leaves their target off screen.
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const snap = TRIP_TRANSITIONS_DISABLED || firstFrame.current;
    const ease = (from: number, to: number) => {
      const eased = snap
        ? to
        : from + (to - from) * (1 - Math.exp(-FOLLOW_RATE * dt));
      return Math.abs(to - eased) < 0.1 ? to : eased;
    };
    firstFrame.current = false;
    camera.scroll = ease(camera.scroll, target);
    camera.scrollX = ease(camera.scrollX, targetX);

    if (worldRef.current) {
      worldRef.current.y = -camera.scroll;
      worldRef.current.x = -camera.scrollX;
    }
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translate(${-camera.scrollX * scale}px, ${-camera.scroll * scale}px)`;
    }
  });

  return null;
};
