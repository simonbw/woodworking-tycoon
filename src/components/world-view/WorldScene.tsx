import { Application, useApplication } from "@pixi/react";
import type { Application as PixiApplication } from "pixi.js";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useQuitToMenu,
  useSaveGame,
} from "../useGameState";
import { CANVAS_RESOLUTION } from "./canvas-resolution";

/**
 * The canvas a walkable place is drawn on: a full-bleed PIXI application
 * that measures its container, fits the world inside it with an apron of
 * ground showing, and hands back where the world's origin landed.
 *
 * The world is the screen — the canvas fills the viewport edge to edge
 * and the place sits centered in it. The renderer runs at device
 * resolution with the world drawn through one scaled root container, so
 * the 2×-resolution sprite art gains real detail instead of being
 * CSS-stretched.
 *
 * Everything here is about the canvas rather than about any one place —
 * the fit, the renderer's size, the headless-build trim, and the DOM
 * overlay's box. What a venue draws on it, how its camera moves, and
 * what its overlay holds are the venue's own (see ShopView).
 */

/**
 * How much of the world the E2E build actually rasterizes. The suite
 * never looks at the pixels — one spec checks the canvas is on screen and
 * nothing reads back a colour — but headless Chromium has no GPU, so every
 * frame is a software raster of the full canvas, and that is the largest
 * single cost in the suite. A tenth in each axis leaves a hundredth of the
 * fill work. Only the backing store shrinks: the ticker's deltas are in
 * logical pixels already, and RendererSize pins the element's CSS size
 * back to them — without that, dropping the resolution shrinks the canvas
 * box too, which puts the world in a corner and scales its hit testing to
 * match, and a spec pointing at anything would miss.
 */
const E2E_RENDER_SCALE = 0.1;

/**
 * Trim the renderer down when the E2E server asks for it (E2E_RENDER_FPS;
 * every other build leaves this empty and the ticker runs free at full
 * resolution).
 *
 * Headless Chromium runs rAF as fast as it can, and a render loop that
 * never yields keeps the main thread busy enough that every Playwright
 * round-trip has to queue behind a frame — measured at 13ms against 0.8ms
 * with the canvas gone. That tax lands on every click and every assertion
 * in the suite. Capping the rate hands the thread back between frames.
 *
 * Don't cap below 10. Walking integrates off the ticker's delta, and
 * useWalkingBody clamps that delta to 100ms so a tab-switch hitch can't
 * fling the body — which means at any rate slower than 10fps the clamp bites
 * every frame and the player covers less ground per second than they should.
 * At 5fps the body walked at half speed, and the movement specs' waits went
 * from comfortable to marginal. Ten is where the clamp stops mattering; going
 * higher buys nothing measurable now that the resolution is scaled down.
 */
function capRenderRate(app: PixiApplication): void {
  const fps = Number(process.env.E2E_RENDER_FPS);
  if (Number.isFinite(fps) && fps > 0) {
    app.ticker.maxFPS = fps;
    app.renderer.resolution = E2E_RENDER_SCALE;
  }
}

/**
 * Application's width/height props only apply at renderer init — this
 * follows them afterwards, so the canvas tracks the container as the
 * viewport resizes (the world container's offset and scale already do).
 */
const RendererSize: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const { app } = useApplication();
  useEffect(() => {
    if (
      app?.renderer &&
      (app.renderer.width !== width || app.renderer.height !== height)
    ) {
      app.renderer.resize(width, height);
    }
  }, [app, width, height]);
  // Pin the element to logical pixels. Dropping the resolution (the E2E
  // build, see capRenderRate) shrinks the backing store *and* the CSS box
  // PIXI writes, which would leave the world drawn in a small patch of the
  // corner with its hit testing scaled to match. Only the backing store is
  // meant to shrink — so the canvas keeps its full size here and just
  // rasterizes fewer pixels into it.
  useEffect(() => {
    if (!app?.canvas) return;
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;
  }, [app, width, height]);
  return null;
};

/** Where the world ended up on the canvas, once it's been measured. */
export interface SceneView {
  /** World pixels to canvas pixels. */
  scale: number;
  /** The canvas, in CSS pixels. */
  width: number;
  height: number;
  /** Where the world's origin lands on it. */
  offsetX: number;
  offsetY: number;
  /** The world's box on screen — its size, scaled. */
  scaledWidth: number;
  scaledHeight: number;
}

/**
 * The DOM layer pinned exactly over the world's box, so every anchor
 * inside keeps world-times-scale coordinates. Rendered outside the
 * canvas and positioned from the same fit.
 */
export const WorldOverlayBox: React.FC<{
  view: SceneView;
  className?: string;
  inert?: boolean;
  children: React.ReactNode;
}> = ({ view, className, inert, children }) => (
  <div
    inert={inert}
    className={className}
    style={{
      left: view.offsetX,
      top: view.offsetY,
      width: view.scaledWidth,
      height: view.scaledHeight,
    }}
  >
    {children}
  </div>
);

export const WorldScene: React.FC<{
  /** The world's own size, in world pixels. */
  worldWidth: number;
  worldHeight: number;
  /**
   * What the fit is computed against, in world pixels — by default the
   * world itself, so the whole place fits on screen. A venue that wants
   * a particular zoom rather than a fitted one (the store matches the
   * garage's) passes the garage's dimensions here and lets its camera
   * pan the difference.
   */
  fitWidth?: number;
  fitHeight?: number;
  /**
   * Ground kept visible around the world when fitting, in world pixels —
   * an apron is what makes a place read as a building on a lot rather
   * than a floor grid pinned to the viewport.
   */
  apron?: number;
  /**
   * Pointer handlers and classes for the element the canvas sits in.
   * Given the fit, because a handler that maps the cursor onto the world
   * needs it — and so nothing is bound before there's a world to map to.
   */
  containerProps?: (view: SceneView) => React.HTMLAttributes<HTMLDivElement>;
  /** The PIXI tree, drawn against the fit. */
  children: (view: SceneView) => React.ReactNode;
  /** The DOM layer over the canvas, positioned by the caller. */
  overlay?: (view: SceneView) => React.ReactNode;
}> = ({
  worldWidth,
  worldHeight,
  fitWidth = worldWidth,
  fitHeight = worldHeight,
  apron = 0,
  containerProps,
  children,
  overlay,
}) => {
  const gameState = useGameState();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const quitToMenu = useQuitToMenu();

  // `null` until the container is measured — the canvas doesn't mount
  // until then, so its very first appearance is already at the fitted
  // size (the renderer snapshots its size on init; mounting it at a
  // placeholder size would flash small, then jump).
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{
    scale: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const fit = Math.min(
        rect.width / (fitWidth + apron * 2),
        rect.height / (fitHeight + apron * 2),
      );
      // Quantized so ordinary layout jitter doesn't rebuild the renderer
      setMeasured({
        scale: Math.min(2, Math.max(0.5, Math.floor(fit * 20) / 20)),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitWidth, fitHeight, apron]);

  if (measured === null) {
    return <div ref={containerRef} className="h-full w-full min-h-0 min-w-0" />;
  }

  const { scale } = measured;
  const scaledWidth = Math.round(worldWidth * scale);
  const scaledHeight = Math.round(worldHeight * scale);
  const view: SceneView = {
    scale,
    width: measured.width,
    height: measured.height,
    offsetX: Math.round((measured.width - scaledWidth) / 2),
    offsetY: Math.round((measured.height - scaledHeight) / 2),
    scaledWidth,
    scaledHeight,
  };

  const { className: containerClassName, ...containerRest } =
    containerProps?.(view) ?? {};

  return (
    <div
      {...containerRest}
      ref={containerRef}
      className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${
        containerClassName ?? ""
      }`}
    >
      <Application
        width={view.width}
        height={view.height}
        backgroundAlpha={0}
        antialias={true}
        // Device pixels, so a close-up is sharp when the camera leans in
        // (capped: past 2× nothing reads sharper). The E2E build's onInit
        // override still lands after this.
        autoDensity={true}
        resolution={CANVAS_RESOLUTION}
        onInit={capRenderRate}
      >
        {/* PIXI renders through its own reconciler, so the game's context
            has to be handed across the boundary again. */}
        <gameStateContext.Provider
          value={{ gameState, updateGameState, saveGame, quitToMenu }}
        >
          <RendererSize width={view.width} height={view.height} />
          {children(view)}
        </gameStateContext.Provider>
      </Application>
      {overlay?.(view)}
    </div>
  );
};
