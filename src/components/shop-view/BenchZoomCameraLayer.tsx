import { useTick } from "@pixi/react";
import { Container } from "pixi.js";
import React, { RefObject } from "react";
import {
  benchZoomProgress,
  benchZoomStage,
  easeInOutCubic,
} from "../bench-view/benchZoom";
import { shopFrame } from "./shopFrameStore";

/**
 * The shop's half of the bench dive (see bench-view/benchZoom.tsx): while
 * a bench view is mounted, the whole world container swells about the
 * bench — scaling up toward the bench view's zoom, panning the bench to
 * the frame's center, un-turning the machine's floor rotation — riding
 * the same shared clock the bench scene rides, so the scene overlay
 * stays glued to the shop's bench footprint all the way in and all the
 * way back out. That coupling is the entire effect: the camera visibly
 * dives into the shop instead of a picture growing over a frozen one.
 *
 * Imperative through the ref like CameraLayer's scroll: the transform
 * moves every frame and React owns none of these properties, so
 * re-renders can't fight the tick. Under reduced motion the ramp pins to
 * its ends and this layer holds identity — the shop never transforms.
 */
export const BenchZoomCameraLayer: React.FC<{
  worldRef: RefObject<Container | null>;
  /** Where the shop floor's origin lands on the canvas, in screen px. */
  offsetX: number;
  offsetY: number;
  scale: number;
}> = ({ worldRef, offsetX, offsetY, scale }) => {
  useTick(() => {
    const node = worldRef.current;
    if (!node) return;
    const { anchor, instant } = benchZoomStage;
    const eased =
      anchor && !instant ? easeInOutCubic(benchZoomProgress()) : 0;
    if (!anchor || eased === 0) {
      node.position.set(0, 0);
      node.pivot.set(0, 0);
      node.scale.set(1);
      node.angle = 0;
      return;
    }
    // The anchor speaks window px; this container's children live in
    // world px behind the fitted offset and scale.
    const toLocalX = (px: number) =>
      (px - shopFrame.left - offsetX) / scale;
    const toLocalY = (px: number) => (px - shopFrame.top - offsetY) / scale;
    node.pivot.set(toLocalX(anchor.xPx), toLocalY(anchor.yPx));
    node.position.set(
      toLocalX(anchor.xPx + (anchor.pivotX - anchor.xPx) * eased),
      toLocalY(anchor.yPx + (anchor.pivotY - anchor.yPx) * eased),
    );
    // The same log-space ramp as the bench scene, run the other way:
    // where the scene shrinks toward the shop's framing, the shop grows
    // toward the scene's.
    node.scale.set(Math.exp(-Math.log(anchor.scale) * eased));
    node.angle = -anchor.angleDeg * eased;
  });

  return null;
};
