import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { cellToPixel, inchesToPixels } from "../../../views/shop-scale";
import { TARGET_HIGHLIGHT_FILTERS } from "../../../views/targetHighlight";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { StoreLayout } from "../../../game/store-layout";
import { TruckEntity } from "../../../sim/entities/TruckEntity";
import { drawCrate } from "../../../views/MachineCrateView";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { ShellStore } from "../../ShellStore";
import { StoreSceneRoot } from "../StoreSceneRoot";

/**
 * The truck in its stall out front — the old StoreTruckSprite as an
 * entity view: the same art the driveway uses, turned nose-+x, with
 * whatever rides in the bed drawn lying in it — cargo hauled from home,
 * and the register's purchases the moment they're rung up. When the
 * trip ends at the register this is the sprite that pulls out of the
 * stall while the screen heads home; the scene root runs that clock
 * (`departElapsed`), the same way the driveway's roll rides the trip
 * theater's.
 */

/** The canvas maps 144" across the art's width, the same figure
 * TruckSprite documents. */
const CANVAS_WIDTH = inchesToPixels(144);
const CANVAS_HEIGHT = CANVAS_WIDTH * (600 / 400);

/** The art's source frame, for mapping the bed into the stall. */
const SRC_WIDTH = 400;
const SRC_HEIGHT = 600;
/** The cargo box's source pixels — rail to rail, tailgate to cab wall. */
const BED_SRC = { x: 124, y: 344, width: 276 - 124, height: 561 - 344 };

/** How long the pull-out takes, and how far it rolls (off the east edge
 * of anything the camera frames). */
export const STORE_DEPART_SECONDS = 1.6;
const DEPART_TRAVEL_PX = 1400;

export class StoreTruckView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private truck: Sprite & GameSprite;
  private cargo: Container & GameSprite;
  private shownCargoKey = "";
  private drawnVersion = -1;
  /** Where the stall sits, so the roll can offset from it. */
  private stallX: number;

  constructor(private layout: StoreLayout) {
    super();
    const stall = layout.truck;
    const centerX = cellToPixel((stall.min[0] + stall.max[0]) / 2);
    const centerY = cellToPixel((stall.min[1] + stall.max[1]) / 2);
    this.stallX = centerX;

    this.truck = new Sprite(
      Texture.from("/images/pickup-truck.png"),
    ) as Sprite & GameSprite;
    this.truck.layerName = "actors";
    this.truck.anchor.set(0.5);
    this.truck.position.set(centerX, centerY);
    this.truck.rotation = Math.PI / 2;
    this.truck.width = CANVAS_WIDTH;
    this.truck.height = CANVAS_HEIGHT;

    this.cargo = new Container() as Container & GameSprite;
    this.cargo.layerName = "actors";

    this.sprites = [this.truck, this.cargo];
  }

  /** Where the bed's center lands in world cells, with the art turned
   * nose-+x: a source offset (ox, oy) from the canvas center maps to
   * (-oy, ox) in the world. */
  private bedCenter(): [number, number] {
    const stall = this.layout.truck;
    const centerX = cellToPixel((stall.min[0] + stall.max[0]) / 2);
    const centerY = cellToPixel((stall.min[1] + stall.max[1]) / 2);
    const srcToWorld = CANVAS_WIDTH / SRC_WIDTH;
    return [
      centerX - (BED_SRC.y + BED_SRC.height / 2 - SRC_HEIGHT / 2) * srcToWorld,
      centerY + (BED_SRC.x + BED_SRC.width / 2 - SRC_WIDTH / 2) * srcToWorld,
    ];
  }

  @on("render")
  onRender() {
    const scene = this.game.entities.tryGetSingleton(StoreSceneRoot);

    // The pull-out, every frame it runs: eased in like the driveway
    // roll — the idle settle, then away. The cargo container's children
    // sit at world coordinates, so both nodes carry the same offset.
    const departed = scene?.departElapsed() ?? null;
    const roll =
      departed === null
        ? 0
        : Math.min(1, departed / STORE_DEPART_SECONDS) ** 2 * DEPART_TRAVEL_PX;
    this.truck.x = this.stallX + roll;
    this.cargo.x = roll;

    const store = this.game.entities.tryGetSingleton(ShellStore);
    if (store && store.version === this.drawnVersion) return;
    this.drawnVersion = store?.version ?? -1;

    // The way home lights up while the shopper stands at the cab.
    const interact = scene?.checkoutOpen ? null : scene?.interact();
    this.truck.filters =
      (interact?.atCab ?? false) ? TARGET_HIGHLIGHT_FILTERS : [];

    // Cargo lies lengthwise in the bed, crates behind the cab, the same
    // fan the driveway's truck deals — turned with the truck.
    const truck = this.game.entities.tryGetSingleton(TruckEntity);
    if (!truck) return;
    const key = [
      truck.crates.map((c) => c.machineTypeId).join(","),
      truck.bed.map((m) => m.id).join(","),
    ].join("|");
    if (key === this.shownCargoKey) return;
    this.shownCargoKey = key;

    this.cargo.removeChildren().forEach((child) => child.destroy());
    const [bedCenterX, bedCenterY] = this.bedCenter();
    truck.crates.forEach((machine, i) => {
      const g = new Graphics();
      drawCrate(g);
      g.position.set(bedCenterX + cellToPixel(1.1 - i * 1.2), bedCenterY);
      this.cargo.addChild(g);
    });
    truck.bed.forEach((material, i) => {
      const holder = new Container();
      holder.position.set(bedCenterX, bedCenterY + ((i % 3) - 1) * 6);
      holder.angle = 90 + ((i * 7) % 21) - 10;
      holder.addChild(createMaterialSprite(material));
      this.cargo.addChild(holder);
    });
  }
}
