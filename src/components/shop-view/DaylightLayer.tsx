import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { daylightAt } from "../../game/daylight";
import { TICKS_PER_DAY } from "../../game/time";
import { dayTicksSpent, isNight } from "../../game/time-flow";
import { useGameState } from "../useGameState";
import { easedColor, easeFraction, packed, stepColor } from "./daylight-tween";
import { doorSpan, WALL_THICKNESS, WorldViewport } from "./EnvironmentLayer";

/**
 * The hour of the day, painted over the world.
 *
 * Drawn last, over everything the camera container holds, and split at the
 * garage wall — because the two sides of that wall are lit by different
 * things:
 *
 * - **Outdoors** gets the sky. A frame of four rects covering the whole
 *   viewport *except* the shop's slab, multiplied over the lawn, the
 *   driveway, the truck, the building, and the player when they walk out
 *   to it. This is where the day actually shows: cool at the open, neutral
 *   at midday, gold through the afternoon, deep blue after close.
 * - **Indoors** gets the bulbs. The slab is excluded from the sky wash and
 *   carries its own, nearly-neutral tint instead, so the shop stays
 *   workable at every hour and only ever warms toward incandescent. A
 *   woodworker doesn't lose the afternoon because the sun moved.
 *
 * The hard edge between the two is the point, not an artifact: it's the
 * wall. What softens it is the third piece — after dark the shop's light
 * spills out through the door opening and lands on the driveway, which is
 * what makes the lit interior read as *lit* rather than as a hole the
 * evening failed to reach.
 *
 * Everything is drawn once in white and re-*tinted* per frame rather than
 * redrawn, so the cost of the whole layer is a few property writes.
 */

/** Warm bulb-colored light on the driveway, and how far out it throws. */
const SPILL_COLOR = 0xffd9a0;
const SPILL_ALPHA = 0.55;
const SPILL_REACH = WALL_THICKNESS * 9;
const SPILL_SPREAD = WALL_THICKNESS * 3;

/**
 * The spill's falloff, as nested wedges: each one reaches this share of
 * the full throw at this share of the full brightness. Stacked, they add
 * up to something that fades with distance instead of ending at a hard
 * line — light out of a doorway has an edge, but not a drawn one.
 */
const SPILL_STEPS: ReadonlyArray<readonly [reach: number, alpha: number]> = [
  [1.0, 0.3],
  [0.62, 0.35],
  [0.3, 0.35],
];

export const DaylightLayer: React.FC<{
  /** The shop slab, in world pixels: [0, width] × [0, height]. */
  width: number;
  height: number;
  viewport: WorldViewport;
}> = ({ width, height, viewport }) => {
  const gameState = useGameState();
  const outdoorRef = useRef<Graphics>(null);
  const interiorRef = useRef<Graphics>(null);
  const spillRef = useRef<Graphics>(null);

  const light = daylightAt(
    dayTicksSpent(gameState) / TICKS_PER_DAY,
    isNight(gameState),
  );
  const targetRef = useRef(light);
  targetRef.current = light;

  const outdoor = useRef(easedColor(light.outdoorTint));
  const interior = useRef(easedColor(light.interiorTint));
  const spill = useRef(light.spill);

  const door = doorSpan(gameState.shopInfo.entrancePosition[0]);

  // The sky, everywhere except the slab. Four rects rather than one with a
  // hole punched in it: the slab is axis-aligned and always the same box,
  // so a frame is both simpler and cheaper than an even-odd fill.
  const drawOutdoor = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(
        viewport.left,
        viewport.top,
        viewport.right - viewport.left,
        -viewport.top,
      );
      g.rect(
        viewport.left,
        height,
        viewport.right - viewport.left,
        viewport.bottom - height,
      );
      g.rect(viewport.left, 0, -viewport.left, height);
      g.rect(width, 0, viewport.right - width, height);
      g.fill(0xffffff);
      g.tint = packed(outdoor.current);
    },
    [
      viewport.left,
      viewport.top,
      viewport.right,
      viewport.bottom,
      width,
      height,
    ],
  );

  const drawInterior = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, width, height);
      g.fill(0xffffff);
      g.tint = packed(interior.current);
    },
    [width, height],
  );

  // A wedge of light thrown out of the door opening, widening as it goes.
  const drawSpill = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const [reach, alpha] of SPILL_STEPS) {
        const throwOut = SPILL_REACH * reach;
        const spread = SPILL_SPREAD * reach;
        g.poly([
          door.left,
          height,
          door.right,
          height,
          door.right + spread,
          height + throwOut,
          door.left - spread,
          height + throwOut,
        ]);
        g.fill({ color: SPILL_COLOR, alpha });
      }
      g.alpha = spill.current * SPILL_ALPHA;
    },
    [door.left, door.right, height],
  );

  useTick((ticker: Ticker) => {
    const t = easeFraction(ticker.deltaMS);
    const want = targetRef.current;
    if (outdoorRef.current) {
      outdoorRef.current.tint = stepColor(outdoor.current, want.outdoorTint, t);
    }
    if (interiorRef.current) {
      interiorRef.current.tint = stepColor(
        interior.current,
        want.interiorTint,
        t,
      );
    }
    if (spillRef.current) {
      spill.current += (want.spill - spill.current) * t;
      spillRef.current.alpha = spill.current * SPILL_ALPHA;
    }
  });

  // Tint and alpha are written by the tick, never passed as props: a prop
  // would re-snap them to the target on every re-render — which is every
  // game tick, i.e. exactly the stepping the easing exists to remove. Each
  // `draw` seeds its own value for the first frame.
  return (
    <pixiContainer eventMode="none">
      <pixiGraphics ref={outdoorRef} draw={drawOutdoor} blendMode="multiply" />
      <pixiGraphics
        ref={interiorRef}
        draw={drawInterior}
        blendMode="multiply"
      />
      {/* Additive, so it lifts the dark driveway toward the bulb's color
          instead of painting a flat yellow shape on top of it. */}
      <pixiGraphics ref={spillRef} draw={drawSpill} blendMode="add" />
    </pixiContainer>
  );
};
