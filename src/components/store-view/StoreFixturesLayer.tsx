import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  LumberRack,
  SheetRack,
  ShelfBay,
  StoreFixture,
  StoreLayout,
  StoreRect,
} from "../../game/store-layout";
import { useTexture } from "../../utils/useTexture";
import {
  colorBySheetGoodKind,
  colorBySpecies,
} from "../shop-view/colorBySpecies";
import { cellToPixel, inchesToPixels } from "../shop-view/shop-scale";

/**
 * The store's furniture, drawn onto the footprints store-layout.ts
 * declares: big-box steel racking for the bays, timber racks striped
 * with the species they carry for the lumber channels, a sheet stack,
 * and the checkout counter. What each bay *sells* is the DOM shelf tag's
 * job (StoreOverlayLayer); these are the shelves under the tags.
 * Procedural on purpose — see docs/asset-backlog.md.
 */

const RACK_STEEL = 0x43474b;
const RACK_SHELF = 0x5a5f64;
const RACK_ORANGE = 0xe06010;
const COUNTER = 0x33363a;
const COUNTER_BELT = 0x55402a;
const TERMINAL = 0x191b1d;
const WOOD_POST = 0x6d5639;

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

function drawBay(g: Graphics, bay: ShelfBay): void {
  const { x, y, w, h } = rectPx(bay.rect);
  g.rect(x, y, w, h);
  g.fill(RACK_STEEL);
  g.rect(x + 3, y + 3, w - 6, h - 6);
  g.fill(RACK_SHELF);
  // Orange uprights at the bay's ends — the big-box racking look.
  g.rect(x, y, 5, h);
  g.rect(x + w - 5, y, 5, h);
  g.fill(RACK_ORANGE);
}

function drawLumberRack(g: Graphics, rack: LumberRack): void {
  const { x, y, w, h } = rectPx(rack.rect);
  g.rect(x, y, w, h);
  g.fill(WOOD_POST);
  // The stock itself: a band per species carried, running the rack's
  // length, in the same colors the boards draw with on the shop floor.
  const bandGap = 3;
  const bands = rack.channel.species.length;
  const bandHeight = (h - bandGap * (bands + 1)) / bands;
  rack.channel.species.forEach((species, index) => {
    const top = y + bandGap + index * (bandHeight + bandGap);
    g.rect(x + 3, top, w - 6, bandHeight);
    g.fill(parseInt(colorBySpecies[species].primary.slice(1), 16));
    // A few board seams down the band
    for (let seam = 1; seam < 4; seam++) {
      g.rect(x + 3, top + (bandHeight / 4) * seam, w - 6, 1);
    }
    g.fill(parseInt(colorBySpecies[species].secondary.slice(1), 16));
  });
}

function drawSheetRack(g: Graphics, rack: SheetRack): void {
  const { x, y, w, h } = rectPx(rack.rect);
  g.rect(x, y, w, h);
  g.fill(RACK_STEEL);
  // A leaning stack of sheets: offset slices in ply tones.
  const kinds = ["plywoodB", "osb", "particleBoard", "plywoodC"] as const;
  kinds.forEach((kind, index) => {
    const inset = 3 + index * 2.5;
    g.rect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    g.fill(parseInt(colorBySheetGoodKind[kind].primary.slice(1), 16));
  });
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
        switch (fixture.kind) {
          case "bay":
            drawBay(g, fixture);
            break;
          case "lumberRack":
            drawLumberRack(g, fixture);
            break;
          case "sheetRack":
            drawSheetRack(g, fixture);
            break;
        }
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
