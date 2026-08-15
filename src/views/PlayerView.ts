import { Sprite } from "pixi.js";
import {
  cellToPixel,
  inchesToPixels,
} from "../components/shop-view/shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite, loadGameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { headingForDirection } from "../game/player-motion";
import { Player } from "../sim/entities/Player";

/**
 * The player's body on screen — the old PersonSprite as a view entity,
 * and the exemplar for the phase-3 sprite ports.
 *
 * The view owns nothing but pixels: every frame it reads its sim
 * entity's continuous position straight onto the sprite (walking never
 * touches React or the sim) and eases the sprite around the shortest
 * arc toward the facing. It spawns as a child of its Player via the
 * view registry, so it lives and dies with it and never serializes.
 *
 * The arms' inventory and the held broom ride the same frame in the old
 * shell; those arrive with the material-sprite fan-out.
 */
const PERSON_SIZE = inchesToPixels(32);

/** How quickly the sprite eases around to a new heading, per second. */
const TURN_RATE = 12;

export class PlayerView extends BaseEntity implements Entity {
  private body: Sprite & GameSprite;

  constructor(private player: Player) {
    super();
    this.body = loadGameSprite("/images/person.png", "actors", {
      anchor: [0.5, 0.5],
    });
    this.body.width = PERSON_SIZE;
    this.body.height = PERSON_SIZE;
    this.sprite = this.body;
  }

  @on("render")
  onRender(dt: number) {
    const [cx, cy] = this.player.position;
    this.body.x = cellToPixel(cx);
    this.body.y = cellToPixel(cy);

    // Ease the sprite around the shortest arc toward the facing. The
    // texture faces up, so facing +x means a quarter turn clockwise.
    const target = headingForDirection(this.player.direction) + Math.PI / 2;
    const delta =
      ((target - this.body.rotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.body.rotation += delta * Math.min(1, dt * TURN_RATE);

    // Out of the shop entirely (a trip, home in bed): no body to draw.
    this.body.visible = this.player.away === null;
  }
}
