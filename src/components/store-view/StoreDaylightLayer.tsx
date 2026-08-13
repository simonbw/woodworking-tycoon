import { useApplication, useTick } from "@pixi/react";
import { Container, Graphics, RenderTexture, Ticker } from "pixi.js";
import React, { useEffect, useMemo, useRef } from "react";
import { daylightAt } from "../../game/daylight";
import { StoreLayout } from "../../game/store-layout";
import { TICKS_PER_DAY } from "../../game/time";
import { dayTicksSpent, isNight } from "../../game/time-flow";
import { easedColor, easeFraction, packed, stepColor } from "../shop-view/daylight-tween";
import { WALL_THICKNESS, WorldViewport } from "../shop-view/EnvironmentLayer";
import { cellToPixel } from "../shop-view/shop-scale";
import { useGameState } from "../useGameState";

/**
 * The hour of the day over the store's lot — the same day/night model the
 * garage runs (daylight.ts), as the same kind of multiply mask
 * (DaylightLayer's design; see its header for why one buffer and one
 * composite). The store's mask is the simple end of that design: the sky's
 * ambient over the lot, the building's shadow swept from its walls, and
 * the sales floor painted back to full brightness — a big-box interior is
 * lit the same at noon and closing time, so only the outside tells the
 * hour. No lamps and no door spill: the fixtures indoors never turn off,
 * and the glass storefront keeps the seam at the wall soft enough
 * without one.
 */

/** The building shadow's noon length in world pixels — the same unit the
 * garage's mask uses (DaylightLayer). */
const SHADOW_UNIT = 21;

/** Stop repainting once the eased values settle (see DaylightLayer). */
const SETTLED = 0.4;

export const StoreDaylightLayer: React.FC<{
  layout: StoreLayout;
  viewport: WorldViewport;
}> = ({ layout, viewport }) => {
  const { app } = useApplication();
  const gameState = useGameState();

  const light = daylightAt(
    dayTicksSpent(gameState) / TICKS_PER_DAY,
    isNight(gameState),
  );
  const targetRef = useRef(light);
  targetRef.current = light;

  const outdoor = useRef(easedColor(light.outdoorTint));
  const shadowColor = useRef(easedColor(light.shadow.tint));
  const eased = useRef({
    shadowDx: light.shadow.dx,
    shadowDy: light.shadow.dy,
  });

  const width = cellToPixel(layout.interior[0]);
  const height = cellToPixel(layout.interior[1]);

  const originX = viewport.left;
  const originY = viewport.top;
  const texWidth = Math.max(1, Math.ceil(viewport.right - viewport.left));
  const texHeight = Math.max(1, Math.ceil(viewport.bottom - viewport.top));

  const texture = useMemo(
    () => RenderTexture.create({ width: texWidth, height: texHeight }),
    [texWidth, texHeight],
  );
  useEffect(() => () => texture.destroy(true), [texture]);

  const parts = useMemo(() => {
    const ambient = new Graphics();
    const shadow = new Graphics();
    const indoors = new Graphics();
    // Order is load-bearing: the shadow multiplies over the ambient, and
    // the interior fill repaints the slab to full brightness over both —
    // the sales floor is lit from inside, so no sky and no shadow reach
    // it. (Blending happens as a child composites into its parent, so
    // the stamps live under a wrapper and the wrapper is rendered.)
    const wrapper = new Container();
    wrapper.addChild(ambient, shadow, indoors);
    return { wrapper, ambient, shadow, indoors };
  }, []);
  useEffect(
    () => () => parts.wrapper.destroy({ children: true }),
    [parts.wrapper],
  );
  useEffect(() => {
    parts.shadow.blendMode = "multiply";
  }, [parts]);

  /** Paint the mask from the current eased values and composite it. */
  const paint = () => {
    if (!app?.renderer) return;
    const { wrapper, ambient, shadow, indoors } = parts;
    const now = eased.current;
    const slabX = -originX;
    const slabY = -originY;

    // 1. The sky, over everything the camera can see.
    ambient.clear();
    ambient.rect(0, 0, texWidth, texHeight);
    ambient.fill(packed(outdoor.current));

    // 2. The building's shadow: the swept hull of the footprint and its
    //    offset copy, so the shadow stays attached to the walls it falls
    //    from (see DaylightLayer's version for the geometry's why).
    shadow.clear();
    const shadowTint = packed(shadowColor.current);
    const ox = now.shadowDx * SHADOW_UNIT;
    const oy = now.shadowDy * SHADOW_UNIT;
    if (shadowTint !== 0xffffff) {
      const x0 = slabX - WALL_THICKNESS;
      const y0 = slabY - WALL_THICKNESS;
      const w = width + WALL_THICKNESS * 2;
      const h = height + WALL_THICKNESS * 2;
      // prettier-ignore
      const points =
        ox >= 0
          ? [x0,y0, x0+w,y0, x0+w+ox,y0+oy, x0+w+ox,y0+h+oy, x0+ox,y0+h+oy, x0,y0+h]
          : [x0+ox,y0+oy, x0+w+ox,y0+oy, x0+w,y0, x0+w,y0+h, x0+w+ox,y0+h+oy, x0+ox,y0+h+oy];
      shadow.poly(points);
      shadow.fill(shadowTint);
    }

    // 3. The sales floor, lit from inside at every hour.
    indoors.clear();
    indoors.rect(slabX, slabY, width, height);
    indoors.fill(0xffffff);

    app.renderer.render({ container: wrapper, target: texture, clear: true });
  };

  // A fresh texture (mount, or the window resized) starts empty, which
  // would multiply the whole world to black for a frame.
  useEffect(() => {
    paint();
  }, [texture, app, width, height, originX, originY]);

  useTick((ticker: Ticker) => {
    const t = easeFraction(ticker.deltaMS);
    const want = targetRef.current;
    const now = eased.current;

    const beforeOutdoor = packed(outdoor.current);
    const beforeShadowTint = packed(shadowColor.current);
    const nextOutdoor = stepColor(outdoor.current, want.outdoorTint, t);
    const nextShadowTint = stepColor(shadowColor.current, want.shadow.tint, t);
    const beforeShadowX = now.shadowDx;
    now.shadowDx += (want.shadow.dx - now.shadowDx) * t;
    now.shadowDy += (want.shadow.dy - now.shadowDy) * t;

    const moved =
      nextOutdoor !== beforeOutdoor ||
      nextShadowTint !== beforeShadowTint ||
      Math.abs(now.shadowDx - beforeShadowX) * SHADOW_UNIT > SETTLED;
    if (moved) paint();
  });

  return (
    <pixiSprite
      texture={texture}
      x={originX}
      y={originY}
      blendMode="multiply"
      eventMode="none"
    />
  );
};
