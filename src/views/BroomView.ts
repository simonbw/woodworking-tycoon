import { Graphics } from "pixi.js";
import { cellToPixelVec, PIXELS_PER_CELL } from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { Broom } from "../sim/singletons/Broom";
import { FLOOR_ITEMS_Z } from "./z-order";

/**
 * The shop broom, leaning wherever it was last set down (F) — the old
 * BroomSprite as the Broom singleton's view. Hidden while it's in the
 * player's hands: the in-hand drawing rides the player's frame
 * (HeldBroomGraphics, owned by PlayerView, exactly as the old
 * PersonSprite mounted HeldBroomSprite). The sweeping lesson's coach
 * outline arrives with the interaction port (phase 4).
 */
export class BroomView extends BaseEntity implements Entity {
  private leaning: Graphics & GameSprite;

  constructor(private broom: Broom) {
    super();
    this.leaning = new Graphics() as Graphics & GameSprite;
    this.leaning.layerName = "floorItems";
    this.leaning.zIndex = FLOOR_ITEMS_Z.leaningBroom;
    drawLeaningBroom(this.leaning);
    this.sprite = this.leaning;
  }

  @on("render")
  onRender() {
    const { owned, position } = this.broom;
    if (!owned || position === null) {
      this.leaning.visible = false;
      return;
    }
    this.leaning.visible = true;
    const [x, y] = cellToPixelVec(position);
    this.leaning.position.set(x, y);
  }
}

/** The leaning broom's one static drawing, verbatim from BroomSprite. */
function drawLeaningBroom(g: Graphics): void {
  g.clear();
  const x = PIXELS_PER_CELL * 0.22;
  const y = PIXELS_PER_CELL * 0.08;
  // Soft shadow under the bristles
  g.ellipse(x + 2, y + 112, 30, 10);
  g.fill({ color: 0x000000, alpha: 0.2 });
  // Handle, leaning against the wall
  g.moveTo(x + 4, y + 88);
  g.lineTo(x + 44, y);
  g.stroke({ width: 9, color: 0x2c2015 });
  g.moveTo(x + 4, y + 88);
  g.lineTo(x + 44, y);
  g.stroke({ width: 6, color: 0x8a6a45 });
  // Ferrule binding the bristles on
  g.moveTo(x - 4, y + 84);
  g.lineTo(x + 14, y + 94);
  g.stroke({ width: 12, color: 0xb8b0a0 });
  // Bristles, flared at the floor
  g.poly([
    { x: x - 8, y: y + 86 },
    { x: x + 18, y: y + 100 },
    { x: x + 10, y: y + 122 },
    { x: x - 24, y: y + 106 },
  ]);
  g.fill(0xd9c374);
  g.poly([
    { x: x - 8, y: y + 86 },
    { x: x + 18, y: y + 100 },
    { x: x + 10, y: y + 122 },
    { x: x - 24, y: y + 106 },
  ]);
  g.stroke({ width: 2, color: 0x8f7c3a });
  // Bristle strands
  for (const t of [0.25, 0.5, 0.75]) {
    g.moveTo(x - 8 + 26 * t, y + 86 + 14 * t);
    g.lineTo(x - 24 + 34 * t, y + 106 + 16 * t);
    g.stroke({ width: 2, color: 0xbfa855 });
  }
}
