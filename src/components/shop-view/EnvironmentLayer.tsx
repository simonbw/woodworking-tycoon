import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { DOOR_HALF_WIDTH } from "../../game/ShopInfo";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";
import { cellToPixel, inchesToPixels } from "./shop-scale";

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

const GRASS = 0x333d2b;
const GRASS_DARK = 0x2b3423;
const GRASS_LIGHT = 0x404c33;
const WALL = 0x332e27;
const WALL_CAP = 0x4d453a;
const JAMB = 0xa8935f;
const THRESHOLD = 0x1a1712;
const SHADOW = 0x000000;
const DRIVEWAY_TINT = 0x9d9a90;

/**
 * The truck parked in the driveway — a '96 Ranger, which is a small pickup:
 * about 69" across the body and 200" bumper to bumper in SuperCab trim.
 *
 * The art is a 400×600 top-down view with the nose up. Inside that canvas
 * the red body is 184 px wide, the mirrors reach 264, and the truck spans
 * 562 px bumper to bumper — proportionally a little longer than a real
 * Ranger, so no single scale can match both figures. Scaling the canvas to
 * 144" splits the difference: a 66" body and a 202" length, each within a
 * few percent. The mirrors land at 95", so the truck fills the 8-ft
 * driveway almost exactly.
 */
const TRUCK_CANVAS_WIDTH = inchesToPixels(144);
const TRUCK_CANVAS_HEIGHT = TRUCK_CANVAS_WIDTH * (600 / 400);

/** Transparent canvas above the front bumper, as a fraction of the art. */
const TRUCK_NOSE_INSET = 27 / 600;

/**
 * Gap between the door threshold and the front bumper. Parked tight on
 * purpose: the camera only keeps a few feet of driveway in frame (see
 * LOT_APRON in ShopView), so every inch of gap is an inch of truck that
 * falls off the bottom of the screen.
 */
const TRUCK_PARK_GAP = inchesToPixels(6);

/** Deterministic per-tuft jitter so the lawn doesn't reseed on resize. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * The lot the garage sits on: grass out to the edge of the screen, a
 * concrete driveway running from the garage door off the bottom of the
 * canvas, and the building's stud walls with an opening where the door
 * is. Drawn under the shop floor, so only the apron outside the slab
 * ever shows. All procedural — see docs/asset-backlog.md before
 * replacing any of it with art.
 */
export const EnvironmentLayer: React.FC<{
  width: number;
  height: number;
  viewport: WorldViewport;
}> = ({ width, height, viewport }) => {
  const gameState = useGameState();
  const concreteTexture = useTexture("/images/concrete-floor-2-big.png");
  const truckTexture = useTexture("/images/pickup-truck.png");

  const doorCenter = cellToPixel(gameState.shopInfo.entrancePosition[0] + 0.5);
  const doorLeft = doorCenter - cellToPixel(DOOR_HALF_WIDTH + 0.5);
  const doorRight = doorCenter + cellToPixel(DOOR_HALF_WIDTH + 0.5);
  const drivewayLeft = doorLeft - WALL_THICKNESS;
  const drivewayRight = doorRight + WALL_THICKNESS;
  const drivewayTop = height + WALL_THICKNESS;

  const drawGround = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(
        viewport.left,
        viewport.top,
        viewport.right - viewport.left,
        viewport.bottom - viewport.top,
      );
      g.fill(GRASS);

      // Sparse tufts, skipping under the building and the driveway
      const step = 40;
      const startX = Math.floor(viewport.left / step) * step;
      const startY = Math.floor(viewport.top / step) * step;
      for (let x = startX; x < viewport.right; x += step) {
        for (let y = startY; y < viewport.bottom; y += step) {
          const jitter = hash2(x, y);
          if (jitter < 0.45) continue;
          const tx = x + (hash2(x + 1, y) - 0.5) * step;
          const ty = y + (hash2(x, y + 1) - 0.5) * step;
          const underBuilding =
            tx > -WALL_THICKNESS - 4 &&
            tx < width + WALL_THICKNESS + 4 &&
            ty > -WALL_THICKNESS - 4 &&
            ty < height + WALL_THICKNESS + 4;
          const underDriveway =
            tx > drivewayLeft && tx < drivewayRight && ty > drivewayTop;
          if (underBuilding || underDriveway) continue;
          g.rect(tx, ty, 3, jitter > 0.75 ? 6 : 4);
          g.fill(jitter > 0.6 ? GRASS_LIGHT : GRASS_DARK);
        }
      }
    },
    [viewport.left, viewport.top, viewport.right, viewport.bottom, width, height, drivewayLeft, drivewayRight, drivewayTop],
  );

  const drawBuilding = useCallback(
    (g: Graphics) => {
      g.clear();

      // The building's shadow on the lot, thrown down and to the right
      g.rect(
        -WALL_THICKNESS + 7,
        -WALL_THICKNESS + 9,
        width + WALL_THICKNESS * 2,
        height + WALL_THICKNESS * 2,
      );
      g.fill({ color: SHADOW, alpha: 0.22 });

      // Walls: full bands on three sides, the bottom split by the door
      g.rect(
        -WALL_THICKNESS,
        -WALL_THICKNESS,
        width + WALL_THICKNESS * 2,
        WALL_THICKNESS,
      );
      g.rect(-WALL_THICKNESS, 0, WALL_THICKNESS, height + WALL_THICKNESS);
      g.rect(width, 0, WALL_THICKNESS, height + WALL_THICKNESS);
      g.rect(-WALL_THICKNESS, height, doorLeft + WALL_THICKNESS, WALL_THICKNESS);
      g.rect(doorRight, height, width - doorRight + WALL_THICKNESS, WALL_THICKNESS);
      g.fill(WALL);

      // Top-plate highlight along the outer perimeter
      g.rect(-WALL_THICKNESS, -WALL_THICKNESS, width + WALL_THICKNESS * 2, 3);
      g.rect(-WALL_THICKNESS, -WALL_THICKNESS, 3, height + WALL_THICKNESS * 2);
      g.rect(width + WALL_THICKNESS - 3, -WALL_THICKNESS, 3, height + WALL_THICKNESS * 2);
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
      <pixiGraphics draw={drawGround} />
      {drivewayHeight > 0 && (
        <pixiTilingSprite
          texture={concreteTexture}
          x={drivewayLeft}
          y={drivewayTop}
          width={drivewayRight - drivewayLeft}
          height={drivewayHeight}
          tilePosition={{ x: 0, y: 0 }}
          tileScale={{ x: 0.25, y: 0.25 }}
          tint={DRIVEWAY_TINT}
        />
      )}
      {/* Nose to the garage, centered on the concrete. Drawn before the
          building so the wall band and its shadow fall across the bumper. */}
      <pixiSprite
        texture={truckTexture}
        x={doorCenter}
        y={drivewayTop + TRUCK_PARK_GAP - TRUCK_CANVAS_HEIGHT * TRUCK_NOSE_INSET}
        width={TRUCK_CANVAS_WIDTH}
        height={TRUCK_CANVAS_HEIGHT}
        anchor={{ x: 0.5, y: 0 }}
      />
      <pixiGraphics draw={drawBuilding} />
    </pixiContainer>
  );
};
