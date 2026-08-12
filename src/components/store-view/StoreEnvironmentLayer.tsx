import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { StoreLayout } from "../../game/store-layout";
import { useTexture } from "../../utils/useTexture";
import { WorldViewport } from "../shop-view/EnvironmentLayer";
import { cellToPixel, inchesToPixels } from "../shop-view/shop-scale";

/**
 * The store's building and lot: the sales floor's slab, the walls with
 * the door opening and a glass storefront, the sidewalk, and the parking
 * lot with the truck's stall marked out. Drawn from the same layout the
 * collision world is built from (store-layout.ts), so a wall you see is
 * a wall you hit. Procedural on purpose — see docs/asset-backlog.md.
 */

const WALL_THICKNESS = inchesToPixels(6);
const WALL = 0x332e27;
const WALL_CAP = 0x4d453a;
const GLASS = 0x9fc4cf;
const MULLION = 0x2b2e30;
const SIDEWALK = 0x9b9894;
const SIDEWALK_SEAM = 0x7f7c78;
const STALL_PAINT = 0xd8d4cd;
const FLOOR_TINT = 0xe3e3e3;
const ASPHALT_TINT = 0x8f8f8f;

export const StoreEnvironmentLayer: React.FC<{
  layout: StoreLayout;
  viewport: WorldViewport;
}> = ({ layout, viewport }) => {
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");
  const asphaltTexture = useTexture("/images/asphalt.png");

  const [width, height] = [
    cellToPixel(layout.interior[0]),
    cellToPixel(layout.interior[1]),
  ];
  const doorLeft = cellToPixel(layout.door.left);
  const doorRight = cellToPixel(layout.door.right);
  const sidewalkBottom = cellToPixel(layout.truck.min[1] - 0.5);

  const drawBuilding = useCallback(
    (g: Graphics) => {
      g.clear();

      // Walls: full bands on the back and sides. The front is mostly
      // storefront glass, so its band draws thinner under the panes.
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

      // Top-plate highlight along the outer perimeter, like the shop's.
      g.rect(-WALL_THICKNESS, -WALL_THICKNESS, width + WALL_THICKNESS * 2, 3);
      g.rect(-WALL_THICKNESS, -WALL_THICKNESS, 3, height + WALL_THICKNESS * 2);
      g.rect(
        width + WALL_THICKNESS - 3,
        -WALL_THICKNESS,
        3,
        height + WALL_THICKNESS * 2,
      );
      g.fill(WALL_CAP);

      // Storefront glass either side of the doors: panes with mullions.
      const paneRuns: Array<[number, number]> = [
        [8, doorLeft - 8],
        [doorRight + 8, width - 8],
      ];
      for (const [left, right] of paneRuns) {
        if (right - left < 24) continue;
        g.rect(left, height + 2, right - left, WALL_THICKNESS - 4);
        g.fill({ color: GLASS, alpha: 0.9 });
        const panes = Math.max(1, Math.round((right - left) / 80));
        for (let i = 0; i <= panes; i++) {
          g.rect(
            left + ((right - left) / panes) * i - 1.5,
            height,
            3,
            WALL_THICKNESS,
          );
        }
        g.fill(MULLION);
      }

      // The door opening: the sliding doors parked open, one pane each
      // side, and a threshold strip across the gap.
      g.rect(doorLeft, height, doorRight - doorLeft, 4);
      g.fill(MULLION);
      g.rect(doorLeft, height + 4, 14, WALL_THICKNESS - 6);
      g.rect(doorRight - 14, height + 4, 14, WALL_THICKNESS - 6);
      g.fill({ color: GLASS, alpha: 0.9 });
    },
    [width, height, doorLeft, doorRight],
  );

  const drawLot = useCallback(
    (g: Graphics) => {
      g.clear();

      // The sidewalk apron between the storefront and the stalls, with
      // expansion seams every dozen feet.
      const walkTop = height + WALL_THICKNESS;
      g.rect(
        viewport.left,
        walkTop,
        viewport.right - viewport.left,
        sidewalkBottom - walkTop,
      );
      g.fill(SIDEWALK);
      for (
        let x = Math.floor(viewport.left / cellToPixel(12)) * cellToPixel(12);
        x < viewport.right;
        x += cellToPixel(12)
      ) {
        g.rect(x, walkTop, 2, sidewalkBottom - walkTop);
      }
      g.rect(
        viewport.left,
        sidewalkBottom - 3,
        viewport.right - viewport.left,
        3,
      );
      g.fill(SIDEWALK_SEAM);

      // Stall paint around the truck's spot: end lines and the curbside
      // stripe, worn white over the asphalt.
      const stall = layout.truck;
      const pad = cellToPixel(0.5);
      const left = cellToPixel(stall.min[0]) - pad;
      const right = cellToPixel(stall.max[0]) + pad;
      const top = cellToPixel(stall.min[1]) - pad;
      const bottom = cellToPixel(stall.max[1]) + pad;
      g.rect(left, top, 4, bottom - top);
      g.rect(right - 4, top, 4, bottom - top);
      g.rect(left, bottom - 4, right - left, 4);
      g.fill({ color: STALL_PAINT, alpha: 0.7 });
    },
    [height, sidewalkBottom, viewport.left, viewport.right, layout],
  );

  return (
    <>
      {/* The parking lot: asphalt everywhere the camera can see. */}
      <pixiTilingSprite
        texture={asphaltTexture}
        tint={ASPHALT_TINT}
        tileScale={{ x: 0.6, y: 0.6 }}
        x={viewport.left}
        y={viewport.top}
        width={viewport.right - viewport.left}
        height={viewport.bottom - viewport.top}
      />
      <pixiGraphics draw={drawLot} />
      {/* The sales floor's slab, lighter than the shop's — a sealed
          retail floor rather than a garage. */}
      <pixiTilingSprite
        texture={floorTexture}
        tint={FLOOR_TINT}
        tilePosition={{ x: 0, y: 0 }}
        tileScale={{ x: 0.25, y: 0.25 }}
        width={width}
        height={height}
      />
      <pixiGraphics draw={drawBuilding} />
    </>
  );
};
