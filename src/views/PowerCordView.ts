import { Graphics } from "pixi.js";
import {
  cordAnchor,
  cordSlack,
  nearestOutlet,
  Outlet,
  outletPositions,
} from "../components/shop-view/power-cords";
import {
  cellToPixel,
  PIXELS_PER_CELL,
} from "../components/shop-view/shop-scale";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { Machine, machineKey } from "../game/Machine";
import { ShopInfo as ShopInfoData } from "../game/ShopInfo";
import { Vector } from "../game/Vectors";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { ShopInfo } from "../sim/singletons/ShopInfo";

/**
 * Power cords for every corded machine on the floor — the old
 * PowerCordLayer as a view entity on the "floorItems" layer, drawn on
 * the slab under the machines so only the runs between them read. The
 * geometry (outlet spots, nearest-outlet routing, per-cord slack) stays
 * in the shared `power-cords.ts`.
 *
 * Redrawn only when the set of corded machines actually changes — a
 * cheap key of positions and rotations per render. A carried machine
 * leaves the machine entities, so its cord unplugs by itself.
 */

const CORD = 0x1f1b16;
const PLUG = 0x3a332b;
const PLATE = 0xcbc0a6;
const PLATE_EDGE = 0x8f866c;
const SLOT = 0x1c1917;

/** Outward normal of the wall an outlet is mounted on, in world axes. */
function outwardNormal(outlet: Outlet): Vector {
  switch (outlet.side) {
    case "top":
      return [0, -1];
    case "bottom":
      return [0, 1];
    case "left":
      return [-1, 0];
    case "right":
      return [1, 0];
  }
}

/** An outlet's point on the wall face, in world pixels. */
function outletPixel(outlet: Outlet): Vector {
  return [cellToPixel(outlet.position[0]), cellToPixel(outlet.position[1])];
}

/**
 * A duplex receptacle drawn on the wall band: an ivory plate proud of the
 * face, two dark slots. Stylized elevation view, like the door jambs.
 */
function drawOutletPlate(g: Graphics, outlet: Outlet): void {
  const [x, y] = outletPixel(outlet);
  const [nx, ny] = outwardNormal(outlet);
  const [tx, ty] = [-ny, nx];
  const plate = (along: number, deep: number, color: number) => {
    const cx = x + nx * (deep / 2);
    const cy = y + ny * (deep / 2);
    const w = Math.abs(tx * along) + Math.abs(nx * deep);
    const h = Math.abs(ty * along) + Math.abs(ny * deep);
    g.rect(cx - w / 2, cy - h / 2, w, h);
    g.fill(color);
  };
  plate(13, 8, PLATE_EDGE);
  plate(11, 7, PLATE);
  // Two slots, side by side along the wall
  for (const offset of [-3, 3]) {
    g.rect(x + tx * offset - 1 + nx * 2, y + ty * offset - 1 + ny * 2, 2, 2);
    g.fill(SLOT);
  }
}

/**
 * One machine's cord: a lazy curve from under the machine to its outlet,
 * ending in a plug body against the wall. The bow is hash-seeded per
 * machine so it holds still frame to frame but re-drapes on a move.
 */
function drawCord(g: Graphics, machine: Machine, shopInfo: ShopInfoData): void {
  const anchor = cordAnchor(machine);
  const outlet = nearestOutlet(anchor, shopInfo);
  const [sx, sy] = [cellToPixel(anchor[0]), cellToPixel(anchor[1])];
  const [ex, ey] = outletPixel(outlet);

  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.hypot(dx, dy) || 1;
  // Bow the cord sideways: more slack on longer runs, capped so a
  // cross-shop cord doesn't swing into the next aisle.
  const bow =
    cordSlack(machineKey(machine.state)) *
    Math.min(dist * 0.25, PIXELS_PER_CELL);
  const midX = sx + dx / 2 + (-dy / dist) * bow;
  const midY = sy + dy / 2 + (dx / dist) * bow;

  g.moveTo(sx, sy);
  g.quadraticCurveTo(midX, midY, ex, ey);
  g.stroke({ width: 3, color: CORD, cap: "round", join: "round" });

  // The plug body, sticking out of the receptacle over the cord's end
  const [nx, ny] = outwardNormal(outlet);
  const [tx, ty] = [-ny, nx];
  const plugAlong = 7;
  const plugOut = 6;
  const cx = ex - nx * (plugOut / 2);
  const cy = ey - ny * (plugOut / 2);
  const w = Math.abs(tx * plugAlong) + Math.abs(nx * plugOut);
  const h = Math.abs(ty * plugAlong) + Math.abs(ny * plugOut);
  g.rect(cx - w / 2, cy - h / 2, w, h);
  g.fill(PLUG);
}

export class PowerCordView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private cords: Graphics & GameSprite;

  /** What the cords were last drawn for, so only a changed machine set
   * (or a resized shop) pays for a redraw. */
  private drawnFor = "";

  constructor() {
    super();
    this.cords = new Graphics() as Graphics & GameSprite;
    this.cords.layerName = "floorItems";
    this.sprite = this.cords;
  }

  @on("render")
  onRender() {
    const shopInfo = this.game.entities.tryGetSingleton(ShopInfo)?.info;
    if (!shopInfo) return;

    const corded = [...this.game.entities.byConstructor(MachineEntity)]
      .filter((entity) => entity.type.corded)
      .map((entity) => entity.view());

    // Identity + placement per cord, sorted so entity order can't force
    // a redraw. Rotation matters: it moves the cord's anchor.
    const key =
      `${shopInfo.size[0]}x${shopInfo.size[1]}|` +
      corded
        .map((m) => `${machineKey(m.state)}r${m.rotation}`)
        .sort()
        .join(";");
    if (key === this.drawnFor) return;
    this.drawnFor = key;

    const g = this.cords;
    g.clear();
    for (const outlet of outletPositions(shopInfo)) {
      drawOutletPlate(g, outlet);
    }
    for (const machine of corded) {
      drawCord(g, machine, shopInfo);
    }
  }
}
