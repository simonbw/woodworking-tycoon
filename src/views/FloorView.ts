import { Graphics, Texture, TilingSprite } from "pixi.js";
import { cellToPixel, PIXELS_PER_CELL, SPACING } from "./shop-scale";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { ShopInfo } from "../sim/singletons/ShopInfo";
import { colors } from "../utils/colors";

/**
 * The shop's concrete slab — the old ShopView's floor pass as a view
 * entity: a tiling concrete sprite over the building's footprint, with
 * the cell grid laid over it as faint tiles (the old FloorTileSprites,
 * batched into one Graphics; their click/hover wiring is interaction
 * work and stays with phase 4).
 *
 * Sized from the ShopInfo singleton and redrawn only when the shop's
 * size changes (the same drawnFor pattern as EnvironmentView).
 */

const TILE_SCALE = 0.25;
const TILE_ALPHA = 0.1;
const TILE_COLOR = colors.zinc[700];

export class FloorView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private slab: TilingSprite & GameSprite;
  private tiles: Graphics & GameSprite;

  /** What the floor was last drawn for, so a boot-order race (the view
   * added before the shop's singletons) or a resized shop redraws. */
  private drawnFor = "";

  constructor() {
    super();
    this.slab = new TilingSprite({
      texture: Texture.from("/images/concrete-floor-2-big.png"),
    }) as TilingSprite & GameSprite;
    this.slab.tileScale.set(TILE_SCALE);
    this.slab.layerName = "floor";
    this.slab.visible = false;

    this.tiles = new Graphics() as Graphics & GameSprite;
    this.tiles.layerName = "floor";
    this.tiles.alpha = TILE_ALPHA;

    this.sprites = [this.slab, this.tiles];
  }

  @on("render")
  onRender() {
    const shopInfo = this.game.entities.tryGetSingleton(ShopInfo)?.info;
    if (!shopInfo) return;

    const key = `${shopInfo.size[0]}x${shopInfo.size[1]}`;
    if (key === this.drawnFor) return;
    this.drawnFor = key;

    const width = cellToPixel(shopInfo.size[0]);
    const height = cellToPixel(shopInfo.size[1]);
    this.slab.width = width;
    this.slab.height = height;
    this.slab.visible = true;

    const g = this.tiles;
    g.clear();
    const size = PIXELS_PER_CELL - SPACING * 2;
    for (let y = 0; y < shopInfo.size[1]; y++) {
      for (let x = 0; x < shopInfo.size[0]; x++) {
        g.rect(
          x * PIXELS_PER_CELL + SPACING,
          y * PIXELS_PER_CELL + SPACING,
          size,
          size,
        );
      }
    }
    g.fill(TILE_COLOR);
  }
}
