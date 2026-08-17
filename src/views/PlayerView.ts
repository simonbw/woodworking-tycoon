import { Container, Sprite, Texture } from "pixi.js";
import { cellToPixel, inchesToPixels } from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { MaterialInstance } from "../game/Materials";
import { headingForDirection } from "../game/player-motion";
import { Player } from "../sim/entities/Player";
import { CarriedMachineView } from "./CarriedMachineView";
import { HeldBroomGraphics } from "./HeldBroomGraphics";
import {
  createMaterialSprite,
  sameMaterialList,
} from "./material-sprites/MaterialSprite";
import { ACTORS_Z } from "./z-order";

/**
 * The player's body on screen — the old PersonSprite as a view entity,
 * and the exemplar for the phase-3 sprite ports.
 *
 * The view owns nothing but pixels: every frame it reads its sim
 * entity's continuous position straight onto its frame (walking never
 * touches React or the sim) and eases the frame around the shortest
 * arc toward the facing. It spawns as a child of its Player via the
 * view registry, so it lives and dies with it and never serializes.
 *
 * The whole frame rotates, exactly like the old PersonSprite's
 * container: the carried materials fan out in the arms beneath the
 * body, the held broom rides between them and the body so the hands
 * overlap its grip, and the body sprite draws on top. The arms rebuild
 * only when the inventory holds different instances (cheap reference
 * compare — materials are immutable data).
 */
const PERSON_SIZE = inchesToPixels(32);

/** How quickly the sprite eases around to a new heading, per second. */
const TURN_RATE = 12;

export class PlayerView extends BaseEntity implements Entity {
  private root: Container & GameSprite;
  private arms: Container;
  private heldBroom = new HeldBroomGraphics();
  private body: Sprite;
  private shownInventory: ReadonlyArray<MaterialInstance> = [];

  constructor(private player: Player) {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "actors";
    this.root.zIndex = ACTORS_Z.player;

    this.arms = this.root.addChild(new Container());
    // The broom rides the same rotated frame, so it points where the
    // body faces; drawn under the sprite so the hands overlap its grip
    this.root.addChild(this.heldBroom.graphics);
    this.body = this.root.addChild(
      new Sprite(Texture.from("/images/person.png")),
    );
    this.body.anchor.set(0.5);
    this.body.width = PERSON_SIZE;
    this.body.height = PERSON_SIZE;

    this.sprite = this.root;
    // The hoisted machine (and its set-down ghost) ride the same body,
    // as their own view on the "carried" layer.
    this.addChild(new CarriedMachineView(player));
  }

  /** The frame's eased world rotation, for whatever rides the body. */
  get bodyRotation(): number {
    return this.root.rotation;
  }

  @on("render")
  onRender(dt: number) {
    const [cx, cy] = this.player.position;
    this.root.x = cellToPixel(cx);
    this.root.y = cellToPixel(cy);

    // Ease the frame around the shortest arc toward the facing. The
    // texture faces up, so facing +x means a quarter turn clockwise.
    const target = headingForDirection(this.player.direction) + Math.PI / 2;
    const delta =
      ((target - this.root.rotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.root.rotation += delta * Math.min(1, dt * TURN_RATE);

    // Out of the shop entirely (a trip, home in bed): no body to draw.
    this.root.visible = this.player.away === null;

    this.syncArms();
    this.heldBroom.update(dt, this.game, this.player, this.root.rotation);
  }

  /** Rebuild the fan of carried materials when the hands change. */
  private syncArms() {
    if (sameMaterialList(this.player.inventory, this.shownInventory)) {
      return;
    }
    this.shownInventory = [...this.player.inventory];
    for (const child of [...this.arms.children]) {
      child.destroy({ children: true });
    }
    this.shownInventory.forEach((material, index) => {
      const holder = this.arms.addChild(new Container());
      holder.angle = index * 1;
      holder.x = inchesToPixels(6);
      holder.addChild(createMaterialSprite(material));
    });
  }
}
