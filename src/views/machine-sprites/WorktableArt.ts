import { Container, Graphics, Sprite } from "pixi.js";
import { PIXELS_PER_CELL } from "../shop-scale";
import { worktableArtSrc } from "./worktable-art";
import { Machine } from "../../game/Machine";
import { MachineActivity } from "./machine-activity";
import {
  artSprite,
  EffectsFrame,
  footprintOffset,
  MachineArtBase,
} from "./machine-art";
import { StagedMaterials } from "./staged-materials";

/**
 * A shop-built worktable — the old `WorktableSprite`: its top (art where
 * a table has some, a procedural laminated top where it doesn't), the
 * upgrades bolted to it, and the staged stock lying on it. The cast
 * shadow is NOT here: it draws in a pass of its own beneath every
 * table's top (see MachineView), because a neighbour's shadow falling
 * across the top you just pushed against it would draw the very seam the
 * flush top is avoiding. The procedural fallback keeps its own little
 * drop shadow, since it has no separate layer to hand off to.
 */
export class WorktableArt extends MachineArtBase {
  private topSprite: Sprite | null = null;
  private readonly topGraphics = new Graphics();
  private readonly upgradeGraphics = new Graphics();
  private readonly materials = new StagedMaterials();

  override setStockHidden(hidden: boolean): void {
    this.materials.root.visible = !hidden;
  }

  constructor(machine: Machine) {
    super();
    const topSrc = worktableArtSrc(machine.type.id, "top");
    if (topSrc) {
      this.topSprite = artSprite(topSrc);
      const [x, y] = footprintOffset(machine);
      this.topSprite.position.set(x, y);
      this.root.addChild(this.topSprite);
    } else {
      this.root.addChild(this.topGraphics);
    }
    this.root.addChild(this.upgradeGraphics);
    // Placements are footprint-center-relative, like image art
    const [fx, fy] = footprintOffset(machine);
    this.materials.root.position.set(fx, fy);
    this.root.addChild(this.materials.root);
  }

  rebuild(machine: Machine): void {
    if (!this.topSprite) {
      this.drawTop(machine);
    }
    this.drawUpgrades(machine);
    this.materials.rebuild(machine);
  }

  override animate(
    dt: number,
    machine: Machine,
    activity: MachineActivity,
    fx: EffectsFrame,
  ): void {
    void machine;
    void fx;
    this.materials.animate(dt, activity.working);
  }

  private bounds(machine: Machine) {
    const cells = machine.type.cellsOccupied;
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // The top fills the footprint edge to edge, square-cornered: tables
    // pushed together are one bench, and an inset or a rounded corner
    // would draw a gap down a seam that isn't there.
    return {
      left: (minX - 0.5) * PIXELS_PER_CELL,
      top: (minY - 0.5) * PIXELS_PER_CELL,
      width: (maxX - minX + 1) * PIXELS_PER_CELL,
      height: (maxY - minY + 1) * PIXELS_PER_CELL,
    };
  }

  private drawTop(machine: Machine): void {
    const g = this.topGraphics;
    g.clear();
    const { left, top, width, height } = this.bounds(machine);

    // Drop shadow toward the lower right
    g.rect(left + 4, top + 5, width, height);
    g.fill({ color: 0x000000, alpha: 0.18 });

    // Leg posts at the corners, sticking out from under the top
    const legSize = PIXELS_PER_CELL * 0.16;
    for (const [lx, ly] of [
      [left + 2, top + 2],
      [left + width - legSize - 2, top + 2],
      [left + 2, top + height - legSize - 2],
      [left + width - legSize - 2, top + height - legSize - 2],
    ]) {
      g.rect(lx - 1.5, ly - 1.5, legSize + 3, legSize + 3);
      g.fill({ color: 0x5c3b1e });
    }

    // The laminated top
    g.rect(left, top, width, height);
    g.fill({ color: 0xb08850 });
    g.rect(left, top, width, height);
    g.stroke({ width: 2.5, color: 0x6b4a26 });

    // Lamination lines run along the long axis
    const alongX = width >= height;
    const stripCount = 4;
    const span = alongX ? height : width;
    for (let i = 1; i < stripCount; i++) {
      const offset = (span / stripCount) * i;
      if (alongX) {
        g.moveTo(left + 4, top + offset);
        g.lineTo(left + width - 4, top + offset);
      } else {
        g.moveTo(left + offset, top + 4);
        g.lineTo(left + offset, top + height - 4);
      }
      g.stroke({ width: 1, color: 0x8a6536, alpha: 0.7 });
    }

    // A light catch along the top-left edges
    g.moveTo(left + 3, top + height * 0.35);
    g.lineTo(left + 3, top + 3);
    g.lineTo(left + width * 0.35, top + 3);
    g.stroke({ width: 1.5, color: 0xd8b478, alpha: 0.8 });
  }

  private drawUpgrades(machine: Machine): void {
    const g = this.upgradeGraphics;
    g.clear();
    const { left, top, width, height } = this.bounds(machine);
    const upgrades = machine.upgrades;

    // Installed upgrades read at a glance. The front edge (toward the
    // operator cell) is +y in machine-local coordinates.
    const front = top + height;
    const viseCount = upgrades.filter((id) => id === "vise").length;
    for (let i = 0; i < Math.min(viseCount, 2); i++) {
      // Cast-iron jaws clamped over the front edge (second vise goes to
      // the other corner)
      const vx = i === 0 ? left + width * 0.18 : left + width * 0.82;
      g.rect(vx - 8, front - 6, 16, 10);
      g.fill({ color: 0x4a5568 });
      g.rect(vx - 8, front - 6, 16, 10);
      g.stroke({ width: 1.5, color: 0x2d3748 });
      // The screw and handle poking out
      g.rect(vx - 1.5, front + 4, 3, 5);
      g.fill({ color: 0x2d3748 });
      g.rect(vx - 6, front + 8, 12, 2.5);
      g.fill({ color: 0x718096 });
    }
    if (upgrades.includes("toolDrawers")) {
      // Drawer fronts with pulls, tucked under the top's front edge
      const drawerWidth = Math.min(width * 0.32, 34);
      for (const dx of [left + width * 0.36, left + width * 0.64]) {
        g.rect(dx - drawerWidth / 2, front - 7, drawerWidth, 6);
        g.fill({ color: 0x8a6536 });
        g.rect(dx - drawerWidth / 2, front - 7, drawerWidth, 6);
        g.stroke({ width: 1, color: 0x5c3b1e });
        g.rect(dx - 4, front - 5.5, 8, 2.5);
        g.fill({ color: 0x2d3748 });
      }
    }
  }
}

/**
 * One table's cast shadow, drawn beneath every table's top (see the
 * layer note above). Nothing at all for a table whose art hasn't been
 * drawn — its procedural top carries its own drop shadow instead.
 */
export function buildWorktableShadow(machine: Machine): Container | null {
  const src = worktableArtSrc(machine.type.id, "shadow");
  if (!src) return null;
  const sprite = artSprite(src);
  const [x, y] = footprintOffset(machine);
  sprite.position.set(x, y);
  return sprite;
}
