import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  fixtureIsSolid,
  ShelfBay,
  StoreLayout,
  StoreRect,
} from "../../game/store-layout";
import { useTexture } from "../../utils/useTexture";
import { cellToPixel, inchesToPixels } from "../shop-view/shop-scale";

/**
 * The store's furniture, drawn onto the footprints store-layout.ts
 * declares: big-box steel racking under the tool wall and the supplies
 * runs, display pads under the machines, painted floor bands under the
 * lumber and sheet piles, and the checkout counter. The merchandise
 * itself is StoreMerchandiseLayer's job — these are the shelves and
 * pads under it. Procedural on purpose — see docs/asset-backlog.md.
 */

const RACK_STEEL = 0x43474b;
const RACK_SHELF = 0x5a5f64;
const RACK_ORANGE = 0xe06010;
const PAD_PAINT = 0xcfd3d6;
const PILE_BAND = 0xd8d4cc;
const COUNTER = 0x33363a;
const COUNTER_BELT = 0x55402a;
const TERMINAL = 0x191b1d;

function rectPx(rect: StoreRect): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: cellToPixel(rect.min[0]),
    y: cellToPixel(rect.min[1]),
    w: cellToPixel(rect.max[0] - rect.min[0]),
    h: cellToPixel(rect.max[1] - rect.min[1]),
  };
}

function drawRackingBay(g: Graphics, bay: ShelfBay): void {
  const { x, y, w, h } = rectPx(bay.rect);
  g.rect(x, y, w, h);
  g.fill(RACK_STEEL);
  g.rect(x + 3, y + 3, w - 6, h - 6);
  g.fill(RACK_SHELF);
  // Orange uprights at the bay's ends — the big-box racking look.
  if (w >= h) {
    g.rect(x, y, 5, h);
    g.rect(x + w - 5, y, 5, h);
  } else {
    g.rect(x, y, w, 5);
    g.rect(x, y + h - 5, w, 5);
  }
  g.fill(RACK_ORANGE);
}

/** A machine display's pad: painted floor with an orange border. */
function drawMachinePad(g: Graphics, bay: ShelfBay): void {
  const { x, y, w, h } = rectPx(bay.rect);
  g.rect(x, y, w, h);
  g.fill(PAD_PAINT);
  g.rect(x + 1, y + 1, w - 2, h - 2);
  g.stroke({ width: 2, color: RACK_ORANGE, alpha: 0.7 });
}

/** The painted band a floor pile sits in — enough floor answer that a
 * pile reads as a spot in the planogram, not a dropped delivery. */
function drawPileBand(g: Graphics, bay: ShelfBay): void {
  const { x, y, w, h } = rectPx(bay.rect);
  g.rect(x + 1, y + 1, w - 2, h - 2);
  g.fill({ color: PILE_BAND, alpha: 0.55 });
}

export const StoreFixturesLayer: React.FC<{
  layout: StoreLayout;
  /** The fixture the shopper stands at, rimmed so the floor answers. */
  targetId?: string | null;
  registerTargeted?: boolean;
}> = ({ layout, targetId, registerTargeted }) => {
  const truckTexture = useTexture("/images/pickup-truck.png");

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const fixture of layout.fixtures) {
        if (fixture.display === "machine") {
          drawMachinePad(g, fixture);
        } else if (fixtureIsSolid(fixture)) {
          drawRackingBay(g, fixture);
        } else {
          drawPileBand(g, fixture);
        }
      }

      // The gondola spines: steel dividers between back-to-back runs,
      // capped in orange like the racking uprights.
      for (const spine of layout.spines) {
        const s = rectPx(spine);
        g.rect(s.x, s.y, s.w, s.h);
        g.fill(RACK_STEEL);
        g.rect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
        g.fill(RACK_SHELF);
        g.rect(s.x, s.y, s.w, 5);
        g.rect(s.x, s.y + s.h - 5, s.w, 5);
        g.fill(RACK_ORANGE);
      }

      // The checkout counter: a dark top with the belt inset and a
      // terminal at the lane end.
      const counter = rectPx(layout.register);
      g.rect(counter.x, counter.y, counter.w, counter.h);
      g.fill(COUNTER);
      g.rect(counter.x + 6, counter.y + 5, counter.w * 0.55, counter.h - 10);
      g.fill(COUNTER_BELT);
      g.rect(counter.x + counter.w - 18, counter.y + 4, 14, 14);
      g.fill(TERMINAL);

      // The floor answering the feet: a light rim around whatever the
      // shopper is standing at (the same job the shop's outline filters
      // do, drawn instead of filtered because the furniture is all one
      // Graphics pass).
      const targeted =
        layout.fixtures.find((fixture) => fixture.id === targetId) ?? null;
      const rimRect = registerTargeted
        ? layout.register
        : (targeted?.rect ?? null);
      if (rimRect) {
        const rim = rectPx(rimRect);
        g.rect(rim.x - 2, rim.y - 2, rim.w + 4, rim.h + 4);
        g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
      }
    },
    [layout, targetId, registerTargeted],
  );

  // The parked truck, nose along +x: the same art the driveway uses,
  // turned a quarter. The canvas maps 144" across the art's width, the
  // same figure TruckSprite documents.
  const stall = layout.truck;
  const truckCenter = {
    x: cellToPixel((stall.min[0] + stall.max[0]) / 2),
    y: cellToPixel((stall.min[1] + stall.max[1]) / 2),
  };
  const canvasWidth = inchesToPixels(144);
  const canvasHeight = canvasWidth * (600 / 400);

  return (
    <>
      <pixiGraphics draw={draw} />
      <pixiSprite
        texture={truckTexture}
        anchor={{ x: 0.5, y: 0.5 }}
        x={truckCenter.x}
        y={truckCenter.y}
        rotation={Math.PI / 2}
        width={canvasWidth}
        height={canvasHeight}
      />
    </>
  );
};
