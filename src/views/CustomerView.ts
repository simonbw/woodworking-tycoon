import { Graphics } from "pixi.js";
import {
  cellToPixel,
  PIXELS_PER_CELL,
} from "../components/shop-view/shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { sidewalkY, standCenter } from "../game/stand";
import { CustomerEntity } from "../sim/entities/CustomerEntity";
import { ShopInfo } from "../sim/singletons/ShopInfo";

/**
 * A passerby out walking the sidewalk line, drawn as a simple circle for
 * now (see docs/asset-backlog.md) — the old CustomerLayer's per-customer
 * sprite as a view entity, paired with its CustomerEntity. The sim steps
 * the customer's position once per tick, so the sprite eases toward its
 * simulated spot every frame — the same trick the player's own
 * between-tick motion uses, minus the physics. A browsing customer
 * drifts up off the sidewalk line toward the table.
 */

/** How much of the remaining gap the sprite closes per second. */
const EASE_PER_SECOND = 8;

/** How far a browsing customer steps up toward the table, in cells. */
const BROWSE_STEP = 0.9;

const SHIRT_COLORS = [0x9c6b53, 0x53759c, 0x6f9c53, 0x8a539c, 0x9c8f53];

const CUSTOMER_RADIUS = PIXELS_PER_CELL * 0.32;

export class CustomerView extends BaseEntity implements Entity {
  private body: Graphics & GameSprite;
  /** Snap to the spawn point on first frame, then ease ever after. */
  private placed = false;

  constructor(private customer: CustomerEntity) {
    super();
    this.body = new Graphics() as Graphics & GameSprite;
    this.body.layerName = "environment";

    // A hash of the id keeps each walker's color stable without storing
    // cosmetics in the sim.
    const hue =
      SHIRT_COLORS[
        Math.abs(
          [...customer.customerId].reduce(
            (acc, ch) => acc * 31 + ch.charCodeAt(0),
            7,
          ),
        ) % SHIRT_COLORS.length
      ];

    // Ground shadow, body, head — read top-down like the player does
    this.body.ellipse(
      0,
      CUSTOMER_RADIUS * 0.35,
      CUSTOMER_RADIUS * 1.1,
      CUSTOMER_RADIUS * 0.55,
    );
    this.body.fill({ color: 0x000000, alpha: 0.18 });
    this.body.circle(0, 0, CUSTOMER_RADIUS);
    this.body.fill(hue);
    this.body.circle(0, 0, CUSTOMER_RADIUS * 0.5);
    this.body.fill(0xd9b38c);

    this.sprite = this.body;
  }

  @on("render")
  onRender(dt: number) {
    const shopInfo = this.game.entities.tryGetSingleton(ShopInfo)?.info;
    if (!shopInfo) return;

    const walkY = sidewalkY(shopInfo);
    const browsing = this.customer.state === "browsing";
    const targetX = cellToPixel(
      browsing ? standCenter(shopInfo)[0] : this.customer.x,
    );
    const targetY = cellToPixel(browsing ? walkY - BROWSE_STEP : walkY);

    if (!this.placed) {
      this.body.position.set(targetX, targetY);
      this.placed = true;
      return;
    }
    const k = Math.min(1, dt * EASE_PER_SECOND);
    this.body.position.set(
      this.body.position.x + (targetX - this.body.position.x) * k,
      this.body.position.y + (targetY - this.body.position.y) * k,
    );
  }
}
