import { useApplication, useTick } from "@pixi/react";
import {
  Container,
  FillGradient,
  Graphics,
  RenderTexture,
  Ticker,
} from "pixi.js";
import React, { useEffect, useMemo, useRef } from "react";
import { daylightAt, LAMP_LIGHT } from "../../game/daylight";
import { TICKS_PER_DAY } from "../../game/time";
import { dayTicksSpent, isNight } from "../../game/time-flow";
import { easedColor, easeFraction, packed, stepColor } from "./daylight-tween";
import { doorSpan, WALL_THICKNESS, WorldViewport } from "./EnvironmentLayer";
import { useGameState } from "../useGameState";

/**
 * The hour of the day, as a light mask over the world.
 *
 * **One buffer, one composite.** Every light in the shop is painted into
 * a single offscreen texture — ambient sky, ambient indoors, the
 * building's shadow taken out of it, the ceiling fixtures and the door
 * spill added into it — and that finished mask is multiplied over the
 * scene exactly once, as the last thing the camera container draws.
 *
 * That structure is the whole design, and it is worth being explicit
 * about why, because the obvious alternative (a stack of tinted shapes
 * with their own blend modes, drawn straight onto the scene) is what this
 * replaced and it looked wrong:
 *
 * - **Light added to the screen has no ceiling.** An additive glow drives
 *   every channel toward white, so a lamp on a blue-grey driveway washed
 *   it out into a pale shape sitting on top of the world. Light added
 *   *into the mask* is bounded by the multiply that follows: it can walk
 *   a surface back up toward its own unlit color and no further. Concrete
 *   under a lamp comes out concrete-colored and brighter — never white.
 * - **Shadow belongs in the same currency as light.** Painted as its own
 *   black shape it was neutral, sitting under the day's color instead of
 *   inside it. Subtracted from the mask, a shadow at golden hour is a
 *   golden-hour shadow.
 *
 * Indoors and out are two ambients in one mask, and the hard seam between
 * them is the garage wall, which is correct: the shop is dim at night
 * like any unlit garage, and it stays workable because the fixtures add
 * their pool back — not because the slab is exempt from the night. The
 * same `lamps` value that raises that pool throws the wedge of light out
 * the door onto the driveway, so the two can never disagree about whether
 * the lights are on.
 *
 * The mask is only re-rendered when something in it actually moved, and
 * the values it's built from ease per frame rather than per game tick
 * (`daylight-tween.ts`).
 */

/**
 * The pool of light the door throws onto the driveway: an ellipse
 * straddling the threshold, reaching further down the drive than across
 * it.
 *
 * An ellipse with a radial gradient rather than a wedge with a blur,
 * deliberately. A `BlurFilter` renders its target to a temporary texture
 * and composites *that*, which silently loses the object's own blend
 * mode — so a blurred, additive shape stops adding and starts painting,
 * and a gradient that fades to black paints black. That bug was visible:
 * the far end of the old spill measured darker in every channel than the
 * bare lawn beside it. A gradient shape needs no filter, so its blend
 * mode survives, and an ellipse is soft on every edge for free.
 */
const SPILL_REACH = WALL_THICKNESS * 13;
const SPILL_SPREAD = WALL_THICKNESS * 5;

/**
 * How far past the threshold the pool's bright core sits. Centering the
 * ellipse *on* the doorway puts its core exactly on the line where the
 * interior fill clips it away, which throws away the brightest part and
 * leaves a wash so faint it reads as nothing. Dropping the core onto the
 * concrete is what makes it look like light coming out of a door.
 */
const SPILL_CORE_DROP = WALL_THICKNESS * 4;

/** How far the lamp pool reaches across the slab, as a share of it. */
const LAMP_POOL_INNER_RADIUS = 0.08;
const LAMP_POOL_OUTER_RADIUS = 0.8;

/**
 * The mask stops being re-rendered once every value it's built from has
 * settled this close to its target — otherwise a light that has visibly
 * finished moving still costs a full-screen redraw every frame forever.
 */
const SETTLED = 0.4;

export const DaylightLayer: React.FC<{
  /** The shop slab, in world pixels: [0, width] × [0, height]. */
  width: number;
  height: number;
  viewport: WorldViewport;
}> = ({ width, height, viewport }) => {
  const { app } = useApplication();
  const gameState = useGameState();

  const light = daylightAt(
    dayTicksSpent(gameState) / TICKS_PER_DAY,
    isNight(gameState),
  );
  const targetRef = useRef(light);
  targetRef.current = light;

  const outdoor = useRef(easedColor(light.outdoorTint));
  const interior = useRef(easedColor(light.interiorTint));
  const shadowColor = useRef(easedColor(light.shadow.tint));
  const eased = useRef({
    lamps: light.lamps,
    shadowDx: light.shadow.dx,
    shadowDy: light.shadow.dy,
  });

  const door = doorSpan(gameState.shopInfo);

  // The viewport is everything the camera can *ever* see, not what it
  // sees right now (see ShopView), so this is stable while the player
  // walks and only changes when the window resizes.
  const originX = viewport.left;
  const originY = viewport.top;
  const texWidth = Math.max(1, Math.ceil(viewport.right - viewport.left));
  const texHeight = Math.max(1, Math.ceil(viewport.bottom - viewport.top));

  const texture = useMemo(
    () => RenderTexture.create({ width: texWidth, height: texHeight }),
    [texWidth, texHeight],
  );
  useEffect(() => () => texture.destroy(true), [texture]);

  // Everything is drawn in texture space: world coordinates shifted by the
  // viewport's origin, so the slab and the door land where they belong.
  const parts = useMemo(() => {
    const ambient = new Graphics();
    const shadow = new Graphics();
    const indoors = new Graphics();
    const pool = new Graphics();
    const spill = new Graphics();
    // A blend mode on the *root* of a renderer.render() is ignored —
    // blending happens as a child composites into its parent (the same
    // gotcha DustLayer's eraser hit), so every stamp lives under a
    // wrapper and the wrapper is what gets rendered.
    // Order is load-bearing. The spill is an ellipse straddling the
    // threshold, and it goes in *before* the interior fill so the opaque
    // slab clips its inner half away: the doorway pool belongs on the
    // driveway, and adding it on top of an already-lit shop would clamp
    // to a flat white patch just inside the door.
    const wrapper = new Container();
    wrapper.addChild(ambient, shadow, spill, indoors, pool);
    return { wrapper, ambient, shadow, indoors, pool, spill };
  }, []);
  useEffect(
    () => () => parts.wrapper.destroy({ children: true }),
    [parts.wrapper],
  );

  const poolFill = useMemo(
    () =>
      new FillGradient({
        type: "radial",
        center: { x: 0.5, y: 0.5 },
        innerRadius: LAMP_POOL_INNER_RADIUS,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: LAMP_POOL_OUTER_RADIUS,
        colorStops: [
          { offset: 0, color: LAMP_LIGHT },
          // Black adds nothing, so the pool simply runs out at the walls.
          { offset: 1, color: 0x000000 },
        ],
        textureSpace: "local",
      }),
    [],
  );

  const spillFill = useMemo(
    () =>
      new FillGradient({
        type: "radial",
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: LAMP_LIGHT },
          // Holds most of its strength across the near half of the throw
          // before giving out, so the drive is lit rather than merely
          // tinged at one spot.
          { offset: 0.4, color: "rgba(150, 124, 88, 0.9)" },
          { offset: 0.7, color: "rgba(96, 79, 56, 0.45)" },
          // Fades out in *alpha* as well as toward black. Adding black
          // already contributes nothing, but a stop that is also fully
          // transparent can't paint the ground dark even if something
          // downstream drops the additive blend — which is exactly the
          // failure the blurred version shipped with.
          { offset: 1, color: "rgba(0, 0, 0, 0)" },
        ],
        textureSpace: "local",
      }),
    [],
  );

  /** Paint the mask from the current eased values and composite it. */
  const paint = () => {
    if (!app?.renderer) return;
    const { wrapper, ambient, shadow, indoors, pool, spill } = parts;
    const now = eased.current;
    const slabX = -originX;
    const slabY = -originY;

    // 1. The sky, over everything.
    ambient.clear();
    ambient.rect(0, 0, texWidth, texHeight);
    ambient.fill(packed(outdoor.current));

    // 2. The building's shadow: the sun taken off the ground, with the
    //    sky left behind. A flat multiply by a color that is floored at
    //    SHADOW_SKY, not black at an alpha — blocking the sun cannot take
    //    a surface below what the sky alone gives it.
    shadow.clear();
    const shadowTint = packed(shadowColor.current);
    if (shadowTint !== 0xffffff) {
      shadow.rect(
        slabX - WALL_THICKNESS + now.shadowDx * SHADOW_UNIT,
        slabY - WALL_THICKNESS + now.shadowDy * SHADOW_UNIT,
        width + WALL_THICKNESS * 2,
        height + WALL_THICKNESS * 2,
      );
      shadow.fill(shadowTint);
    }

    // 3. Indoors: its own ambient, replacing the sky over the slab. The
    //    seam is the garage wall.
    indoors.clear();
    indoors.rect(slabX, slabY, width, height);
    indoors.fill(packed(interior.current));

    // 4. The ceiling fixtures, added into the mask over the slab.
    pool.clear();
    pool.alpha = now.lamps;
    pool.renderable = now.lamps > 0.004;
    if (pool.renderable) {
      pool.rect(slabX, slabY, width, height);
      pool.fill(poolFill);
    }

    // 5. The same lamps, escaping through the door onto the driveway.
    spill.clear();
    spill.alpha = now.lamps;
    spill.renderable = pool.renderable;
    if (spill.renderable) {
      // Straddling the threshold, so the pool starts inside the doorway
      // and reaches out onto the drive rather than beginning at a line.
      const doorMid = slabX + (door.left + door.right) / 2;
      spill.ellipse(
        doorMid,
        slabY + height + SPILL_CORE_DROP,
        (door.right - door.left) / 2 + SPILL_SPREAD,
        SPILL_REACH,
      );
      spill.fill(spillFill);
    }

    app.renderer.render({ container: wrapper, target: texture, clear: true });
  };

  // Blend modes for the stamps that aren't plain ambient. Set once; the
  // per-frame paint only changes geometry and color.
  useEffect(() => {
    parts.shadow.blendMode = "multiply";
    parts.pool.blendMode = "add";
    parts.spill.blendMode = "add";
  }, [parts]);

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
    const beforeInterior = packed(interior.current);
    const beforeShadowTint = packed(shadowColor.current);
    const nextOutdoor = stepColor(outdoor.current, want.outdoorTint, t);
    const nextInterior = stepColor(interior.current, want.interiorTint, t);
    const nextShadowTint = stepColor(shadowColor.current, want.shadow.tint, t);
    const beforeLamps = now.lamps;
    const beforeShadowX = now.shadowDx;
    now.lamps += (want.lamps - now.lamps) * t;
    now.shadowDx += (want.shadow.dx - now.shadowDx) * t;
    now.shadowDy += (want.shadow.dy - now.shadowDy) * t;

    // Repainting a settled mask every frame is a full-screen redraw for
    // nothing, and the light is settled the vast majority of the time.
    const moved =
      nextOutdoor !== beforeOutdoor ||
      nextInterior !== beforeInterior ||
      nextShadowTint !== beforeShadowTint ||
      Math.abs(now.lamps - beforeLamps) > 0.001 ||
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

/**
 * The length of the building's shadow at noon, in world pixels — the unit
 * `daylight.ts` measures the rest of the day against.
 */
const SHADOW_UNIT = 21;
