import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { ShelfBay, StoreLayout, StoreRect } from "../../game/store-layout";
import { TARGET_HIGHLIGHT_FILTERS } from "../shop-view/targetHighlight";
import { cellToPixel } from "../shop-view/shop-scale";

/**
 * The store's furniture, drawn onto the footprints store-layout.ts
 * declares: big-box steel racking under the tool wall and the supplies
 * runs, painted floor bands under the lumber and sheet piles, the
 * gondola spines, and the checkout counter. The merchandise itself is
 * StoreMerchandiseLayer's job — these are the shelves under it. What the
 * shopper stands at wears the shop's outline shader, drawn by the
 * merchandise layer's highlight pass (the register's rim lives here,
 * because the counter is this layer's own drawing). Procedural on
 * purpose — see docs/asset-backlog.md.
 */

const RACK_STEEL = 0x43474b;
const RACK_SHELF = 0x5a5f64;
const RACK_ORANGE = 0xe06010;
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

/** The painted band a floor pile sits in — enough floor answer that a
 * pile reads as a spot in the planogram, not a dropped delivery. */
function drawPileBand(g: Graphics, bay: ShelfBay): void {
  const { x, y, w, h } = rectPx(bay.rect);
  g.rect(x + 1, y + 1, w - 2, h - 2);
  g.fill({ color: PILE_BAND, alpha: 0.55 });
}

function drawCounter(g: Graphics, rect: StoreRect): void {
  const counter = rectPx(rect);
  g.rect(counter.x, counter.y, counter.w, counter.h);
  g.fill(COUNTER);
  g.rect(counter.x + 6, counter.y + 5, counter.w * 0.55, counter.h - 10);
  g.fill(COUNTER_BELT);
  g.rect(counter.x + counter.w - 18, counter.y + 4, 14, 14);
  g.fill(TERMINAL);
}

export const StoreFixturesLayer: React.FC<{
  layout: StoreLayout;
  registerTargeted?: boolean;
}> = ({ layout, registerTargeted }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const fixture of layout.fixtures) {
        if (fixture.display === "machine") {
          // The machine art carries the display itself — no pad.
          continue;
        } else if (fixture.display === "racking") {
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
    },
    [layout],
  );

  // The counter is its own drawing so it can wear the targeting outline
  // when the shopper stands at the register.
  const drawRegister = useCallback(
    (g: Graphics) => {
      g.clear();
      drawCounter(g, layout.register);
    },
    [layout],
  );

  return (
    <>
      <pixiGraphics draw={draw} />
      <pixiGraphics
        draw={drawRegister}
        filters={registerTargeted ? TARGET_HIGHLIGHT_FILTERS : undefined}
      />
    </>
  );
};
