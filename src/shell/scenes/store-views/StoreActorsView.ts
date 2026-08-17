import { Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  cellToPixel,
  inchesToPixels,
  PIXELS_PER_CELL,
} from "../../../views/shop-scale";
import {
  Shopper,
  SHOPPER_RADIUS,
  spawnShoppers,
} from "../../../components/store-view/storeShoppers";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { CartLine } from "../../../game/cart";
import { currentCart } from "../../../game/game-actions/cart-actions";
import { headingForDirection } from "../../../game/player-motion";
import { Player } from "../../../sim/entities/Player";
import { projectGameState } from "../../../sim/projection";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { StoreSceneRoot } from "../StoreSceneRoot";
import { drawFlatbed, drawFlatbedHandle, KRAFT, KRAFT_EDGE } from "./flatbed";

/**
 * The people and the cart on the sales floor — the old PersonSprite,
 * StorePushCartSprite, and StoreShopperLayer as one entity view. The
 * shopper's own body is the shop's person sprite riding the scene
 * root's continuous walk; the pushed flatbed eases after a lead point
 * ahead of the body with its handle swinging back toward the pusher;
 * the ambient shoppers draw as the sidewalk customers' circles (the
 * scene root steps them and makes them solid to the walk).
 */

const PERSON_SIZE = inchesToPixels(32);
const TURN_RATE = 12;

/** How far ahead of the body the pushed cart rides, in cells. */
const LEAD_DISTANCE = 1.9;
/** How much of the remaining gap the cart closes per second. */
const FOLLOW_RATE = 14;
/** The most the cart ever trails its lead point, in cells. */
const MAX_TRAIL = 0.35;

const SHIRT_COLORS = [0x9c6b53, 0x53759c, 0x6f9c53, 0x8a539c, 0x9c8f53];
const BODY_RADIUS = PIXELS_PER_CELL * 0.34;

/** A line's rough footprint on the deck, in square feet — what decides
 * the stacking order: sheets under boards under boxes. */
function lineFootprint(line: CartLine): number {
  if (line.kind === "machine") return 4;
  if (line.kind !== "material") return 0.8;
  const material = line.material as { length?: number; width?: number };
  if (
    typeof material.length === "number" &&
    typeof material.width === "number"
  ) {
    return (material.length / 12) * (material.width / 12);
  }
  return 1;
}

/** One line of the cart, lying on the deck at world size. */
function buildParcel(line: CartLine, index: number): Container {
  const holder = new Container();
  const ox = cellToPixel((((index * 29) % 14) - 7) / 100);
  const oy = cellToPixel((((index * 17) % 22) - 11) / 100);
  const tilt = (((index * 13) % 17) - 8) / 160;
  holder.position.set(ox, oy);
  if (line.kind === "material") {
    holder.rotation = Math.PI / 2 + tilt;
    holder.addChild(createMaterialSprite(line.material));
    return holder;
  }
  // Everything boxed rides as its carton — a machine's is just bigger.
  holder.rotation = tilt;
  const big = line.kind === "machine";
  const w = big ? 34 : 15;
  const h = big ? 25 : 12;
  const g = new Graphics();
  g.rect(-w / 2, -h / 2, w, h);
  g.fill(KRAFT);
  g.rect(-w / 2, -h / 2, w, h);
  g.stroke({ width: 1.5, color: KRAFT_EDGE });
  g.rect(-w / 2, -1, w, 2);
  g.fill(KRAFT_EDGE);
  holder.addChild(g);
  return holder;
}

export class StoreActorsView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private person: Container & GameSprite;
  private cart: Container & GameSprite;
  private crowd: Container & GameSprite;

  private cartDeck = new Graphics();
  private cartLoad = new Container();
  private cartHandle = new Graphics();
  private cartPlaced = false;
  private shownCartKey = "";

  private shopperNodes: Graphics[] = [];

  constructor() {
    super();
    this.person = new Container() as Container & GameSprite;
    this.person.layerName = "actors";
    const body = new Sprite(Texture.from("/images/person.png"));
    body.anchor.set(0.5);
    body.width = PERSON_SIZE;
    body.height = PERSON_SIZE;
    this.person.addChild(body);

    this.cart = new Container() as Container & GameSprite;
    this.cart.layerName = "actors";
    drawFlatbed(this.cartDeck);
    drawFlatbedHandle(this.cartHandle);
    this.cart.addChild(this.cartDeck);
    this.cart.addChild(this.cartLoad);
    this.cart.addChild(this.cartHandle);

    this.crowd = new Container() as Container & GameSprite;
    this.crowd.layerName = "actors";

    // The cart under the person under nothing; the crowd beneath both.
    this.sprites = [this.crowd, this.cart, this.person];
  }

  /** The crowd's circles, one per shopper the scene root spawned. */
  private syncCrowd(shoppers: ReadonlyArray<Shopper>): void {
    while (this.shopperNodes.length < shoppers.length) {
      const index = this.shopperNodes.length;
      const g = new Graphics();
      // Ground shadow, body, head — the sidewalk customers' exact read.
      g.ellipse(0, BODY_RADIUS * 0.35, BODY_RADIUS * 1.1, BODY_RADIUS * 0.55);
      g.fill({ color: 0x000000, alpha: 0.18 });
      g.circle(0, 0, BODY_RADIUS);
      g.fill(SHIRT_COLORS[index % SHIRT_COLORS.length]);
      g.circle(0, 0, BODY_RADIUS * 0.5);
      g.fill(0xd9b38c);
      this.shopperNodes.push(g);
      this.crowd.addChild(g);
    }
    shoppers.forEach((shopper, index) => {
      const node = this.shopperNodes[index];
      node.position.set(
        cellToPixel(shopper.position[0]),
        cellToPixel(shopper.position[1]),
      );
    });
  }

  @on("render")
  onRender(dt: number) {
    const scene = this.game.entities.tryGetSingleton(StoreSceneRoot);
    const player = this.game.entities.tryGetSingleton(Player);
    const trip = player?.away;
    const position = scene?.bodyPosition();
    if (!scene || !player || trip?.kind !== "shopping" || !position) {
      this.person.visible = false;
      this.cart.visible = false;
      return;
    }
    this.person.visible = true;
    this.syncCrowd(scene.shoppers);

    // The body: position from the continuous walk, rotation eased around
    // the shortest arc toward the facing (the shop body's exact motion).
    this.person.position.set(
      cellToPixel(position[0]),
      cellToPixel(position[1]),
    );
    const target = headingForDirection(scene.bodyDirection()) + Math.PI / 2;
    const delta =
      ((target - this.person.rotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.person.rotation += delta * Math.min(1, dt * TURN_RATE);

    // The pushed flatbed.
    if (!trip.hasCart) {
      // The next flatbed snaps into place at the corral rather than
      // easing in from wherever the last one was abandoned.
      this.cart.visible = false;
      this.cartPlaced = false;
      return;
    }
    this.cart.visible = true;

    const heading = scene.bodyHeading();
    const targetX = cellToPixel(
      position[0] + Math.cos(heading) * LEAD_DISTANCE,
    );
    const targetY = cellToPixel(
      position[1] + Math.sin(heading) * LEAD_DISTANCE,
    );
    if (!this.cartPlaced) {
      this.cart.position.set(targetX, targetY);
      this.cartPlaced = true;
    } else {
      const k = Math.min(1, dt * FOLLOW_RATE);
      let x = this.cart.position.x + (targetX - this.cart.position.x) * k;
      let y = this.cart.position.y + (targetY - this.cart.position.y) * k;
      // Never trail farther than the cap — a body at full stride keeps
      // its cart at arm's length instead of walking up its back.
      const trail = Math.hypot(targetX - x, targetY - y);
      const maxTrail = cellToPixel(MAX_TRAIL);
      if (trail > maxTrail) {
        const pull = (trail - maxTrail) / trail;
        x += (targetX - x) * pull;
        y += (targetY - y) * pull;
      }
      this.cart.position.set(x, y);
    }
    // The handle end swings back toward the person pushing it.
    this.cart.rotation = Math.atan2(
      cellToPixel(position[1]) - this.cart.position.y,
      cellToPixel(position[0]) - this.cart.position.x,
    );

    // The load: biggest footprint on the bottom, smallest on top — a
    // stable sort on the line's place in the cart keeps the pile from
    // reshuffling as things are added around it.
    const gameState = projectGameState(this.game);
    const cart = currentCart(gameState) ?? [];
    const key = cart
      .map((line) => (line.kind === "material" ? line.material.id : line.kind))
      .join("|");
    if (key !== this.shownCartKey) {
      this.shownCartKey = key;
      this.cartLoad.removeChildren().forEach((child) => child.destroy());
      const stacked = cart
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            lineFootprint(b.line) - lineFootprint(a.line) || a.index - b.index,
        );
      for (const { line, index } of stacked.slice(0, 10)) {
        this.cartLoad.addChild(buildParcel(line, index));
      }
    }
  }
}

export { SHOPPER_RADIUS };
