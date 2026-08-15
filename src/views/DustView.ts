import { Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import { DustStamp, onDustStamp } from "../components/shop-view/dustStampBus";
import { dustColorBySpecies } from "../components/shop-view/colorBySpecies";
import {
  cellToPixel,
  PIXELS_PER_CELL,
} from "../components/shop-view/shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import {
  DUST_MAX_PER_CELL,
  DustMap,
  dustKeyToVec,
  dustTotal,
} from "../game/Dust";
import { DustSpecies } from "../game/Materials";
import { DustLayer } from "../sim/singletons/DustLayer";
import { ShopInfo } from "../sim/singletons/ShopInfo";
import { mixColors } from "../utils/colorUtils";
import { seededRandom } from "../utils/randUtils";

/**
 * The sawdust that has come to rest on the shop floor — the old
 * DustLayer component as the view paired with the sim `DustLayer`
 * singleton. All of it is baked into a single RenderTexture so an
 * arbitrarily filthy shop renders at constant cost.
 *
 * The sim replaces the singleton's `map` object whenever the dust
 * changes (MachineSystem, CleaningSystem, and bench-commands all assign
 * a fresh map), so the view redraws only when the reference changes —
 * and then only the cells whose totals moved: erase their patch of the
 * texture, redraw them at the new amount. The seeded stamps are stable
 * per cell, so a growing cell keeps its pattern and just gains stamps;
 * a swept cell visibly thins. Live particle emitters bake their settled
 * chips in through the stamp bus, same as the old shell.
 */

/**
 * Stamps drawn per unit of persisted dust when rebuilding a cell from
 * the sim's map. Art-directed to roughly match the density a live
 * session's settled particles produce — not an exact accounting.
 */
const REBUILD_STAMPS_PER_UNIT = 5;
/** Of the rebuilt stamps, how many read as shaving curls vs flecks. */
const REBUILD_SHAVING_CHANCE = 0.3;
const STAMP_ALPHA = 0.8;
/** How opaque a completely buried cell's base wash gets. */
const WASH_MAX_ALPHA = 0.72;

function drawStamp(g: Graphics, stamp: DustStamp): void {
  if (stamp.kind === "dust") {
    g.rect(
      stamp.x - stamp.size / 2,
      stamp.y - stamp.size / 2,
      stamp.size,
      stamp.size,
    );
    g.fill({ color: stamp.color, alpha: STAMP_ALPHA });
  } else {
    // moveTo first: without it the path connects each curl to the last
    // one drawn, which turns a batched rebuild into streaks
    g.moveTo(
      stamp.x + stamp.size * Math.cos(stamp.angle),
      stamp.y + stamp.size * Math.sin(stamp.angle),
    );
    g.arc(
      stamp.x,
      stamp.y,
      stamp.size,
      stamp.angle,
      stamp.angle + Math.PI * 1.3,
    );
    g.stroke({ width: 1.4, color: stamp.color, alpha: STAMP_ALPHA });
  }
}

/**
 * Deterministic drawing for one cell's persisted dust — same save, same
 * grime. A dusting is a scatter of flecks; a real drift lays a wobbly
 * opaque wash under them, so a buried cell reads as buried and a
 * cleaning stroke visibly takes the floor back. The wash polygon stays
 * inside the cell's rect (the eraser works cell rects), but its
 * vertices reach the edges so neighboring drifts touch instead of
 * showing the grid.
 */
function drawRebuiltCell(
  g: Graphics,
  key: string,
  amounts: DustMap[string],
): void {
  const [cellX, cellY] = dustKeyToVec(key);
  const rng = seededRandom(`dust:${key}`);
  const total = dustTotal(amounts);
  const fraction = Math.min(1, total / DUST_MAX_PER_CELL);

  // The base wash: overlapping soft clumps in the amount-weighted blend
  // of the species colors. Clump centers pile up mid-cell and thin out
  // toward the edges, so neighboring drifts read as one dappled mass
  // with no cell seams — the grid only exists in the ledger.
  if (fraction > 0.1) {
    let washColor: number | null = null;
    let weight = 0;
    for (const [species, amount] of Object.entries(amounts)) {
      const color = dustColorBySpecies[species as DustSpecies].primary;
      weight += amount ?? 0;
      washColor =
        washColor === null
          ? mixColors(color, 0xffffff, 0)
          : mixColors(washColor, color, (amount ?? 0) / weight);
    }
    if (washColor !== null) {
      const clumps = Math.ceil(3 + fraction * 9);
      const depth = Math.min(1, fraction * 1.4);
      for (let i = 0; i < clumps; i++) {
        // Clumps stay inside the cell rect (the eraser works cell rects)
        const clumpRadius = PIXELS_PER_CELL * (0.14 + rng() * 0.2);
        const range = PIXELS_PER_CELL - clumpRadius * 2;
        g.circle(
          cellX * PIXELS_PER_CELL + clumpRadius + rng() * range,
          cellY * PIXELS_PER_CELL + clumpRadius + rng() * range,
          clumpRadius,
        );
        g.fill({
          color: mixColors(washColor, 0xffffff, rng() * 0.25),
          alpha: (0.35 + rng() * 0.2) * depth * WASH_MAX_ALPHA,
        });
      }
    }
  }

  for (const [species, amount] of Object.entries(amounts)) {
    const base = dustColorBySpecies[species as DustSpecies].primary;
    const count = Math.round((amount ?? 0) * REBUILD_STAMPS_PER_UNIT);
    for (let i = 0; i < count; i++) {
      const shaving = rng() < REBUILD_SHAVING_CHANCE;
      drawStamp(g, {
        x: (cellX + 0.05 + rng() * 0.9) * PIXELS_PER_CELL,
        y: (cellY + 0.05 + rng() * 0.9) * PIXELS_PER_CELL,
        color: mixColors(base, 0xffffff, 0.15 + rng() * 0.3),
        size: shaving ? 3 + rng() * 2 : 1.4 + rng() * 1.6,
        kind: shaving ? "shavings" : "dust",
        angle: rng() * Math.PI * 2,
      });
    }
  }
}

export class DustView extends BaseEntity implements Entity {
  private floor: Sprite & GameSprite;
  private texture: RenderTexture | null = null;
  // The eraser draws through a wrapper because a blend mode on the root
  // of a renderer.render() call is ignored — blending happens when a
  // child composites into its parent's render.
  private scratch = new Graphics();
  private wrapper = new Container();
  /** The map the texture currently pictures. */
  private prevMap: DustMap | null = null;
  /** The slab size the texture was created for. */
  private drawnFor = "";
  private unsubscribeStamps?: () => void;

  constructor(private dust: DustLayer) {
    super();
    this.wrapper.addChild(this.scratch);
    this.floor = new Sprite() as Sprite & GameSprite;
    this.floor.layerName = "dust";
    this.floor.position.set(0, 0);
    this.sprite = this.floor;
  }

  @on("add")
  onAdd() {
    // Live particle chips bake in as they settle, same bus as the old
    // shell (the emitters arrive with the effects fan-out).
    this.unsubscribeStamps = onDustStamp((stamp) => this.bakeStamp(stamp));
  }

  @on("destroy")
  onDestroy() {
    this.unsubscribeStamps?.();
    this.texture?.destroy(true);
    this.texture = null;
    this.wrapper.destroy({ children: true });
  }

  private pixiRenderer() {
    return this.game.renderer?.app.renderer;
  }

  private bakeStamp(stamp: DustStamp): void {
    const renderer = this.pixiRenderer();
    if (!renderer || !this.texture) return;
    this.scratch.clear();
    drawStamp(this.scratch, stamp);
    renderer.render({
      container: this.wrapper,
      target: this.texture,
      clear: false,
    });
    this.scratch.clear();
  }

  /** Redraw the whole floor from the sim's map in one batched render. */
  private rebuildAll(): void {
    const renderer = this.pixiRenderer();
    if (!renderer || !this.texture) return;
    this.scratch.clear();
    for (const [key, amounts] of Object.entries(this.dust.map)) {
      drawRebuiltCell(this.scratch, key, amounts);
    }
    renderer.render({
      container: this.wrapper,
      target: this.texture,
      clear: true,
    });
    this.scratch.clear();
    this.prevMap = this.dust.map;
  }

  /**
   * A cell's dust changed — a sweep taking it, a machine laying more
   * down: erase its patch of the texture and redraw it at the new
   * amount. This keeps the floor an exact picture of the sim's map
   * (the settling chips from the stamp bus are sub-tick garnish on top).
   */
  private redrawChanged(prev: DustMap, next: DustMap): void {
    const renderer = this.pixiRenderer();
    if (!renderer || !this.texture) return;
    const changed = [
      ...new Set([...Object.keys(prev), ...Object.keys(next)]),
    ].filter(
      (key) => Math.abs(dustTotal(next[key]) - dustTotal(prev[key])) > 1e-6,
    );
    if (changed.length === 0) return;

    this.scratch.clear();
    for (const key of changed) {
      const [cellX, cellY] = dustKeyToVec(key);
      this.scratch.rect(
        cellX * PIXELS_PER_CELL,
        cellY * PIXELS_PER_CELL,
        PIXELS_PER_CELL,
        PIXELS_PER_CELL,
      );
      this.scratch.fill(0xffffff);
    }
    this.scratch.blendMode = "erase";
    renderer.render({
      container: this.wrapper,
      target: this.texture,
      clear: false,
    });
    this.scratch.blendMode = "normal";
    this.scratch.clear();
    for (const key of changed) {
      const remaining = next[key];
      if (remaining) {
        drawRebuiltCell(this.scratch, key, remaining);
      }
    }
    renderer.render({
      container: this.wrapper,
      target: this.texture,
      clear: false,
    });
    this.scratch.clear();
  }

  @on("render")
  onRender() {
    const shopInfo = this.game.entities.tryGetSingleton(ShopInfo)?.info;
    if (!shopInfo || !this.pixiRenderer()) return;

    // A fresh texture (first render, or the shop resized): redraw the
    // persisted floor wholesale.
    const key = `${shopInfo.size[0]}x${shopInfo.size[1]}`;
    if (key !== this.drawnFor) {
      this.drawnFor = key;
      this.texture?.destroy(true);
      this.texture = RenderTexture.create({
        width: cellToPixel(shopInfo.size[0]),
        height: cellToPixel(shopInfo.size[1]),
        antialias: true,
      });
      this.floor.texture = this.texture;
      this.rebuildAll();
      return;
    }

    // The sim replaces the map object on change — same reference, same
    // picture, nothing to do.
    if (this.prevMap !== this.dust.map) {
      const prev = this.prevMap ?? {};
      this.prevMap = this.dust.map;
      this.redrawChanged(prev, this.dust.map);
    }
  }
}
