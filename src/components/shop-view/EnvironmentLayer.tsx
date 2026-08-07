import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { daylightAt } from "../../game/daylight";
import { MaterialInstance } from "../../game/Materials";
import { DOOR_HALF_WIDTH } from "../../game/ShopInfo";
import { TICKS_PER_DAY } from "../../game/time";
import { dayTicksSpent, isNight } from "../../game/time-flow";
import { lerp } from "../../utils/mathUtils";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";
import { easeFraction } from "./daylight-tween";
import { cellToPixel, inchesToPixels } from "./shop-scale";
import { TruckHighlight, TruckSprite } from "./TruckSprite";

/**
 * What the full-bleed canvas can see, in world pixels — the shop floor
 * spans [0, width] × [0, height], so the lot around it lives at negative
 * coordinates and beyond.
 */
export interface WorldViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Stud wall drawn around the floor slab — 6" reads right at this scale. */
export const WALL_THICKNESS = inchesToPixels(6);

const WALL = 0x332e27;
const WALL_CAP = 0x4d453a;
const JAMB = 0xa8935f;
const THRESHOLD = 0x1a1712;
const SHADOW = 0x000000;

/**
 * The length of the building's shadow at noon, in world pixels — the unit
 * `daylight.ts` measures the rest of the day against. Roughly a foot and a
 * half of lot at the shop's 4px-per-inch scale, which stretches to about
 * four feet when the sun is near the horizon.
 */
const SHADOW_UNIT = 21;

/**
 * Both ground textures are 512² photographs. The scales below set how much
 * lot one repeat covers: roughly 4' of lawn and 6' of driveway, so blades
 * and aggregate land near life size against the 4px-per-inch shop scale.
 * Even scaled up this far the tiles are still minified on screen — they
 * shipped at 2048² and were cut to 512², which costs nothing visible here
 * and 19MB off the boot download.
 */
const LAWN_TILE_SCALE = 0.4;
const DRIVEWAY_TILE_SCALE = 0.6;

/**
 * Both photos were shot in full sun and arrive far brighter than anything
 * else on screen. These knock them back into the shop's muted palette —
 * the lawn off its vivid midday green, the driveway down to blacktop
 * rather than the pale gravel it reads as at full brightness.
 */
const LAWN_TINT = 0x6b7a66;
const DRIVEWAY_TINT = 0x8f8f8f;

/**
 * The garage door's opening in world pixels. Shared with `DaylightLayer`,
 * which puts the shop's light-spill through the same gap after dark.
 */
export function doorSpan(entranceX: number): { left: number; right: number } {
  const center = cellToPixel(entranceX + 0.5);
  const half = cellToPixel(DOOR_HALF_WIDTH + 0.5);
  return { left: center - half, right: center + half };
}

/**
 * The lot the garage sits on: a tiling lawn out to the edge of the
 * screen, an asphalt driveway running from the garage door off the
 * bottom of the canvas, and the building's stud walls with an opening
 * where the door is. Drawn under the shop floor, so only the apron
 * outside the slab ever shows. The walls are still procedural — see
 * docs/asset-backlog.md before replacing them with art.
 */
export const EnvironmentLayer: React.FC<{
  width: number;
  height: number;
  viewport: WorldViewport;
  truckHighlight?: TruckHighlight;
  truckCargoHighlight?: MaterialInstance;
  truckTutorialHighlight?: TruckHighlight;
}> = ({
  width,
  height,
  viewport,
  truckHighlight,
  truckCargoHighlight,
  truckTutorialHighlight,
}) => {
  const gameState = useGameState();
  const grassTexture = useTexture("/images/grass.png");
  const asphaltTexture = useTexture("/images/asphalt.png");

  const { left: doorLeft, right: doorRight } = doorSpan(
    gameState.shopInfo.entrancePosition[0],
  );
  const drivewayLeft = doorLeft - WALL_THICKNESS;
  const drivewayRight = doorRight + WALL_THICKNESS;
  const drivewayTop = height + WALL_THICKNESS;

  const drawBuilding = useCallback(
    (g: Graphics) => {
      g.clear();

      // Walls: full bands on three sides, the bottom split by the door
      g.rect(
        -WALL_THICKNESS,
        -WALL_THICKNESS,
        width + WALL_THICKNESS * 2,
        WALL_THICKNESS,
      );
      g.rect(-WALL_THICKNESS, 0, WALL_THICKNESS, height + WALL_THICKNESS);
      g.rect(width, 0, WALL_THICKNESS, height + WALL_THICKNESS);
      g.rect(
        -WALL_THICKNESS,
        height,
        doorLeft + WALL_THICKNESS,
        WALL_THICKNESS,
      );
      g.rect(
        doorRight,
        height,
        width - doorRight + WALL_THICKNESS,
        WALL_THICKNESS,
      );
      g.fill(WALL);

      // Top-plate highlight along the outer perimeter
      g.rect(-WALL_THICKNESS, -WALL_THICKNESS, width + WALL_THICKNESS * 2, 3);
      g.rect(-WALL_THICKNESS, -WALL_THICKNESS, 3, height + WALL_THICKNESS * 2);
      g.rect(
        width + WALL_THICKNESS - 3,
        -WALL_THICKNESS,
        3,
        height + WALL_THICKNESS * 2,
      );
      g.fill(WALL_CAP);

      // Door jambs and the threshold across the opening
      g.rect(doorLeft - 10, height, 10, WALL_THICKNESS);
      g.rect(doorRight, height, 10, WALL_THICKNESS);
      g.fill(JAMB);
      g.rect(doorLeft, height, doorRight - doorLeft, 4);
      g.fill(THRESHOLD);
    },
    [width, height, doorLeft, doorRight],
  );

  const drivewayHeight = Math.max(0, viewport.bottom - drivewayTop);

  return (
    <pixiContainer>
      {/* The lawn only covers what the camera can see, so it follows the
          viewport. tilePosition cancels that offset out to keep the
          texture pinned to world space — otherwise the grass would slide
          along under the player as they walk. */}
      <pixiTilingSprite
        texture={grassTexture}
        x={viewport.left}
        y={viewport.top}
        width={viewport.right - viewport.left}
        height={viewport.bottom - viewport.top}
        tilePosition={{ x: -viewport.left, y: -viewport.top }}
        tileScale={{ x: LAWN_TILE_SCALE, y: LAWN_TILE_SCALE }}
        tint={LAWN_TINT}
      />
      {drivewayHeight > 0 && (
        <pixiTilingSprite
          texture={asphaltTexture}
          x={drivewayLeft}
          y={drivewayTop}
          width={drivewayRight - drivewayLeft}
          height={drivewayHeight}
          tilePosition={{ x: 0, y: 0 }}
          tileScale={{ x: DRIVEWAY_TILE_SCALE, y: DRIVEWAY_TILE_SCALE }}
          tint={DRIVEWAY_TINT}
        />
      )}
      {/* Backed in, tailgate to the garage. Drawn before the building so
          the wall band and its shadow fall across the tailgate. The
          sprite handles its own trip animation and absence — the player
          drove it (see truckStageStore). */}
      <TruckSprite
        highlight={truckHighlight}
        highlightedCargo={truckCargoHighlight}
        tutorialHighlight={truckTutorialHighlight}
      />
      <BuildingShadow width={width} height={height} />
      <pixiGraphics draw={drawBuilding} />
    </pixiContainer>
  );
};

/**
 * The building's shadow on the lot. Drawn once as a plain slab at the
 * origin and then *moved* every frame, because its offset is the sun's
 * position: long to the right first thing, short and straight down at
 * noon, long to the left before close, gone after dark
 * (`daylight.ts`).
 *
 * Per-frame rather than per-render for the same reason the dial tweens:
 * at the idle creep a tick lands every twelve seconds, and a shadow that
 * jumped a foot at a time would read as a glitch rather than as the
 * afternoon going by.
 */
const BuildingShadow: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const shadowRef = useRef<Graphics>(null);
  const gameState = useGameState();

  const target = daylightAt(
    dayTicksSpent(gameState) / TICKS_PER_DAY,
    isNight(gameState),
  ).shadow;
  const targetRef = useRef(target);
  targetRef.current = target;
  const current = useRef({ ...target });

  const apply = (g: Graphics) => {
    const now = current.current;
    g.x = now.dx * SHADOW_UNIT;
    g.y = now.dy * SHADOW_UNIT;
    g.alpha = now.alpha;
  };

  // Position and alpha are deliberately NOT React props: they're written
  // every frame by the tick below, and a prop would re-snap them to the
  // target on every re-render — which is every game tick, i.e. exactly the
  // stepping the easing exists to remove. `draw` runs on mount and on any
  // geometry change, so seeding the values here covers the first frame.
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(
        -WALL_THICKNESS,
        -WALL_THICKNESS,
        width + WALL_THICKNESS * 2,
        height + WALL_THICKNESS * 2,
      );
      g.fill(SHADOW);
      apply(g);
    },
    [width, height],
  );

  useTick((ticker: Ticker) => {
    const g = shadowRef.current;
    if (!g) return;
    const t = easeFraction(ticker.deltaMS);
    const now = current.current;
    const want = targetRef.current;
    now.dx = lerp(now.dx, want.dx, t);
    now.dy = lerp(now.dy, want.dy, t);
    now.alpha = lerp(now.alpha, want.alpha, t);
    apply(g);
  });

  return <pixiGraphics ref={shadowRef} draw={draw} />;
};
