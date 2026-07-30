import { useTick } from "@pixi/react";
import { Container, Ticker } from "pixi.js";
import React, { RefObject } from "react";
import { camera } from "./cameraStore";
import { playerMotion } from "./playerMotionStore";

/**
 * Follows the player out the garage door. Indoors the camera is exactly
 * the fitted, centered framing ShopView computes — this layer holds the
 * scroll at zero, so nothing about the interior view changed. As the
 * player walks down the driveway the scroll eases toward a linear map of
 * how far down the lot they are, reaching scrollMax (the full lot in
 * frame) a couple of cells before the world's bottom edge.
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
  /** Player cell y where scrolling begins: the building's south wall. */
  scrollStartY: number;
  /** Player cell y where the scroll tops out at scrollMax. */
  scrollEndY: number;
  /** Furthest the view scrolls, in world pixels (0 on a tall viewport
   * that already sees the whole lot). */
  scrollMax: number;
  scale: number;
}> = ({ worldRef, overlayRef, scrollStartY, scrollEndY, scrollMax, scale }) => {
  useTick((ticker: Ticker) => {
    const progress =
      scrollEndY > scrollStartY
        ? Math.min(
            1,
            Math.max(
              0,
              (playerMotion.pos[1] - scrollStartY) / (scrollEndY - scrollStartY),
            ),
          )
        : 0;
    const target = scrollMax * progress;

    // Ease with the same hitch clamp the body uses, then snap the last
    // fraction of a pixel so a settled camera writes a settled number.
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const eased =
      camera.scroll + (target - camera.scroll) * (1 - Math.exp(-FOLLOW_RATE * dt));
    camera.scroll = Math.abs(target - eased) < 0.1 ? target : eased;

    if (worldRef.current) {
      worldRef.current.y = -camera.scroll;
    }
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translateY(${-camera.scroll * scale}px)`;
    }
  });

  return null;
};
