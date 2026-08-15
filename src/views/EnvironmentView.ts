import { Graphics, Texture, TilingSprite } from "pixi.js";
import {
  cellToPixel,
  inchesToPixels,
} from "../components/shop-view/shop-scale";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import {
  doorCenterX,
  DOOR_WIDTH,
  ShopInfo as ShopInfoData,
} from "../game/ShopInfo";
import { ShopInfo } from "../sim/singletons/ShopInfo";

/**
 * The lot the garage sits on — the old EnvironmentLayer as a view
 * entity: a tiling lawn out to the edge of the screen, an asphalt
 * driveway running from the garage door off the bottom of the canvas,
 * and the building's stud walls with an opening where the door is. The
 * truck, the stand, and the customers are their own views.
 *
 * The lawn only covers what the camera can see, so it re-follows the
 * world viewport every frame; tilePosition cancels the offset out to
 * keep the texture pinned to world space.
 */

export const WALL_THICKNESS = inchesToPixels(6);

const WALL = 0x332e27;
const WALL_CAP = 0x4d453a;
const JAMB = 0xa8935f;
const THRESHOLD = 0x1a1712;

const LAWN_TILE_SCALE = 0.4;
const DRIVEWAY_TILE_SCALE = 0.6;
const LAWN_TINT = 0x6b7a66;
const DRIVEWAY_TINT = 0x8f8f8f;

/** The garage door's opening in world pixels. */
export function doorSpan(shopInfo: ShopInfoData): {
  left: number;
  right: number;
} {
  const center = cellToPixel(doorCenterX(shopInfo));
  const half = cellToPixel(DOOR_WIDTH / 2);
  return { left: center - half, right: center + half };
}

export class EnvironmentView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private lawn: TilingSprite & GameSprite;
  private driveway: TilingSprite & GameSprite;
  private building: Graphics & GameSprite;

  constructor() {
    super();
    this.lawn = new TilingSprite({
      texture: Texture.from("/images/grass.png"),
    }) as TilingSprite & GameSprite;
    this.lawn.tileScale.set(LAWN_TILE_SCALE);
    this.lawn.tint = LAWN_TINT;
    this.lawn.layerName = "environment";

    this.driveway = new TilingSprite({
      texture: Texture.from("/images/asphalt.png"),
    }) as TilingSprite & GameSprite;
    this.driveway.tileScale.set(DRIVEWAY_TILE_SCALE);
    this.driveway.tint = DRIVEWAY_TINT;
    this.driveway.layerName = "environment";

    this.building = new Graphics() as Graphics & GameSprite;
    this.building.layerName = "environment";

    this.sprites = [this.lawn, this.driveway, this.building];
  }

  /** What the building was last drawn for, so a boot-order race (the
   * view added before the shop's singletons) or a resized shop redraws. */
  private drawnFor = "";

  private shopInfo(): ShopInfoData | undefined {
    return this.game.entities.tryGetSingleton(ShopInfo)?.info;
  }

  private redrawBuilding(shopInfo: ShopInfoData) {
    const width = cellToPixel(shopInfo.size[0]);
    const height = cellToPixel(shopInfo.size[1]);
    const { left: doorLeft, right: doorRight } = doorSpan(shopInfo);
    const g = this.building;
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
    g.rect(-WALL_THICKNESS, height, doorLeft + WALL_THICKNESS, WALL_THICKNESS);
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
  }

  @on("render")
  onRender() {
    const shopInfo = this.shopInfo();
    const renderer = this.game.renderer;
    if (!shopInfo || !renderer) return;

    const key = `${shopInfo.size[0]}x${shopInfo.size[1]}@${doorCenterX(shopInfo)}`;
    if (key !== this.drawnFor) {
      this.drawnFor = key;
      this.redrawBuilding(shopInfo);
    }

    // What the camera can see, in world pixels.
    const camera = this.game.camera;
    const viewport = camera.getWorldViewport();
    const left = viewport.left;
    const top = viewport.top;
    const right = viewport.right;
    const bottom = viewport.bottom;

    this.lawn.position.set(left, top);
    this.lawn.width = right - left;
    this.lawn.height = bottom - top;
    this.lawn.tilePosition.set(-left, -top);

    const height = cellToPixel(shopInfo.size[1]);
    const { left: doorLeft, right: doorRight } = doorSpan(shopInfo);
    const drivewayLeft = doorLeft - WALL_THICKNESS;
    const drivewayRight = doorRight + WALL_THICKNESS;
    const drivewayHeight = Math.max(0, bottom - height);
    this.driveway.position.set(drivewayLeft, height);
    this.driveway.width = drivewayRight - drivewayLeft;
    this.driveway.height = drivewayHeight;
    this.driveway.visible = drivewayHeight > 0;
  }
}
