import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { MaterialInstance } from "../../game/Materials";
import { doorCenterX, DOOR_WIDTH, ShopInfo } from "../../game/ShopInfo";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";
import { cellToPixel, inchesToPixels } from "./shop-scale";
import { CustomerLayer } from "./CustomerLayer";
import { StandSprite } from "./StandSprite";
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
export function doorSpan(shopInfo: ShopInfo): { left: number; right: number } {
  const center = cellToPixel(doorCenterX(shopInfo));
  const half = cellToPixel(DOOR_WIDTH / 2);
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
  standHighlight?: boolean;
  standItemHighlight?: MaterialInstance;
  standTutorialHighlight?: boolean;
}> = ({
  width,
  height,
  viewport,
  truckHighlight,
  truckCargoHighlight,
  truckTutorialHighlight,
  standHighlight,
  standItemHighlight,
  standTutorialHighlight,
}) => {
  const gameState = useGameState();
  const grassTexture = useTexture("/images/grass.png");
  const asphaltTexture = useTexture("/images/asphalt.png");

  const { left: doorLeft, right: doorRight } = doorSpan(gameState.shopInfo);
  const drivewayLeft = doorLeft - WALL_THICKNESS;
  const drivewayRight = doorRight + WALL_THICKNESS;
  // The asphalt runs all the way to the slab's edge so no grass peeks
  // through the doorway; the building draws over it, so the wall bands
  // and jambs cover its corners outside the opening.
  const drivewayTop = height;

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
      {/* The for-sale stand in the grass at the end of the driveway, and
          whoever's out walking past it */}
      <StandSprite
        highlight={standHighlight}
        highlightedItem={standItemHighlight}
        tutorialHighlight={standTutorialHighlight}
      />
      <CustomerLayer />
      <pixiGraphics draw={drawBuilding} />
    </pixiContainer>
  );
};
