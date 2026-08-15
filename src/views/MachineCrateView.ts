import { Graphics } from "pixi.js";
import {
  cellToPixelCenter,
  PIXELS_PER_CELL,
} from "../components/shop-view/shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { MachineCrateEntity } from "../sim/entities/MachineCrateEntity";

/**
 * A machine delivery still in its crate — the old `MachineCrateSprite`
 * as a view entity: a stenciled pine box sitting on the floor. Crates
 * don't block walking — the player stands on one and unpacks it straight
 * into their arms — so it draws with the other things lying on the
 * floor, under the machines.
 */
export class MachineCrateView extends BaseEntity implements Entity {
  private readonly graphics: Graphics & GameSprite;

  constructor(private readonly crate: MachineCrateEntity) {
    super();
    this.graphics = new Graphics() as Graphics & GameSprite;
    this.graphics.layerName = "floorItems";
    drawCrate(this.graphics);
    this.sprite = this.graphics;
  }

  @on("render")
  onRender() {
    const [x, y] = cellToPixelCenter(this.crate.position);
    this.graphics.position.set(x, y);
  }
}

function drawCrate(g: Graphics): void {
  g.clear();
  // A real crate is bigger than the 1-ft cell it anchors to — it
  // overhangs its cell visually but never blocks walking.
  const half = PIXELS_PER_CELL * 0.9;

  // The lid
  g.rect(-half, -half, half * 2, half * 2);
  g.fill(0xc9a86a);
  g.rect(-half, -half, half * 2, half * 2);
  g.stroke({ width: 3, color: 0x8a6f42 });

  // Plank seams
  for (const offset of [-half / 2, 0, half / 2]) {
    g.moveTo(-half, offset);
    g.lineTo(half, offset);
    g.stroke({ width: 1.5, color: 0x8a6f42 });
  }

  // Cross braces nailed over the lid
  g.moveTo(-half, -half);
  g.lineTo(half, half);
  g.stroke({ width: 3, color: 0xa8895a });
  g.moveTo(half, -half);
  g.lineTo(-half, half);
  g.stroke({ width: 3, color: 0xa8895a });

  // Corner nail heads
  for (const [nx, ny] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    g.circle(nx * (half - 5), ny * (half - 5), 2);
    g.fill(0x5c4a2e);
  }
}
