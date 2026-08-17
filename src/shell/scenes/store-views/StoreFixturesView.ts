import { Container, Graphics } from "pixi.js";
import { cellToPixel } from "../../../views/shop-scale";
import { TARGET_HIGHLIGHT_FILTERS } from "../../../views/targetHighlight";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { ShelfBay, StoreLayout, StoreRect } from "../../../game/store-layout";
import { ShellStore } from "../../ShellStore";
import { StoreSceneRoot } from "../StoreSceneRoot";
import {
  drawFlatbed,
  drawFlatbedHandle,
  FLATBED_LENGTH_CELLS,
} from "./flatbed";

/**
 * The store's furniture — the old StoreFixturesLayer as an entity view:
 * big-box steel racking under the tool wall and the supplies runs,
 * painted floor bands under the lumber and sheet piles, the gondola
 * spines, the checkout counter, and the corral's nested flatbeds. The
 * merchandise itself is the merchandise view's job — these are the
 * shelves under it. The register's and corral's targeting rims live
 * here (their drawings do too); the bays' rims ride the merchandise
 * pass, as before. Procedural on purpose — see docs/asset-backlog.md.
 */

const RACK_STEEL = 0x43474b;
const RACK_SHELF = 0x5a5f64;
const RACK_ORANGE = 0xe06010;
const PILE_BAND = 0xd8d4cc;
const COUNTER = 0x33363a;
const COUNTER_BELT = 0x55402a;
const TERMINAL = 0x191b1d;

/** How far apart the corral's nested decks sit, in cells. */
const CORRAL_NESTING = 0.3;
const CORRAL_CART_COUNT = 3;

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

export class StoreFixturesView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private furniture: Graphics & GameSprite;
  private register: Graphics & GameSprite;
  private corral: Container & GameSprite;

  constructor(private layout: StoreLayout) {
    super();
    this.furniture = new Graphics() as Graphics & GameSprite;
    this.furniture.layerName = "floorItems";
    this.register = new Graphics() as Graphics & GameSprite;
    this.register.layerName = "floorItems";
    this.corral = new Container() as Container & GameSprite;
    this.corral.layerName = "floorItems";

    const g = this.furniture;
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

    // The counter is its own drawing so it can wear the targeting
    // outline when the shopper stands at the register.
    drawCounter(this.register, layout.register);

    // The corral's flatbeds: nested deck-into-handle against the wall
    // the way returned carts actually stack — each the same drawing the
    // pushed cart uses, so the thing you take is the thing you saw.
    const rect = layout.corral;
    const cy = cellToPixel((rect.min[1] + rect.max[1]) / 2);
    const firstCenter = rect.max[0] - 0.1 - FLATBED_LENGTH_CELLS / 2;
    for (let i = 0; i < CORRAL_CART_COUNT; i++) {
      const cart = new Container();
      cart.position.set(cellToPixel(firstCenter - i * CORRAL_NESTING), cy);
      // Handles face the walkway, decks nose toward the wall.
      cart.rotation = Math.PI;
      const cartG = new Graphics();
      drawFlatbed(cartG);
      drawFlatbedHandle(cartG);
      cart.addChild(cartG);
      this.corral.addChild(cart);
    }

    this.sprites = [this.furniture, this.register, this.corral];
  }

  /** The ShellStore version the rims were last set for — the signature
   * covers the shopper's cell, so re-resolving per frame is waste. */
  private drawnVersion = -1;

  @on("render")
  onRender() {
    // The register's and corral's rims follow where the shopper stands.
    const store = this.game.entities.tryGetSingleton(ShellStore);
    if (store && store.version === this.drawnVersion) return;
    this.drawnVersion = store?.version ?? -1;
    const scene = this.game.entities.tryGetSingleton(StoreSceneRoot);
    const interact = scene?.checkoutOpen ? null : scene?.interact();
    this.register.filters =
      (interact?.atRegister ?? false) ? TARGET_HIGHLIGHT_FILTERS : [];
    this.corral.filters =
      (interact?.atCorral ?? false) && !(interact?.hasCart ?? false)
        ? TARGET_HIGHLIGHT_FILTERS
        : [];
  }
}
