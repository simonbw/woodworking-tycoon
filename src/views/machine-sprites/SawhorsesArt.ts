import { Graphics } from "pixi.js";
import { PIXELS_PER_CELL } from "../shop-scale";
import { Machine } from "../../game/Machine";
import { MachineActivity } from "./machine-activity";
import {
  EffectsFrame,
  footprintContainer,
  MachineArtBase,
} from "./machine-art";
import { StagedMaterials } from "./staged-materials";

/**
 * Two folding sawhorses seen from above — the old `SawhorsesSprite`,
 * standing a couple of feet apart across the span. Deliberately drawn as
 * the bare horses: what lies across them is the sheet on the machine,
 * rendered as staged stock, so an empty pair reads as empty from across
 * the shop.
 *
 * Procedural on purpose — see docs/asset-backlog.md.
 */
export class SawhorsesArt extends MachineArtBase {
  private readonly materials = new StagedMaterials();

  override setStockHidden(hidden: boolean): void {
    this.materials.root.visible = !hidden;
  }

  constructor(machine: Machine) {
    super();
    const holder = footprintContainer(machine);
    const g = new Graphics();
    drawHorses(g);
    holder.addChild(g);
    holder.addChild(this.materials.root);
    this.root.addChild(holder);
  }

  rebuild(machine: Machine): void {
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
}

function drawHorses(g: Graphics): void {
  g.clear();
  const cell = PIXELS_PER_CELL;
  // Footprint is 3×2 cells; art is drawn about the footprint center.
  const halfW = cell * 1.5;
  const halfH = cell;
  const beamHalf = halfW * 0.92;
  const legSpread = halfH * 0.72;

  // Each horse: a top beam running the span, with splayed legs whose
  // feet show past it on both sides.
  for (const y of [-halfH * 0.45, halfH * 0.45]) {
    // Shadow
    g.roundRect(-beamHalf + 3, y - 4 + 4, beamHalf * 2, 9, 3);
    g.fill({ color: 0x000000, alpha: 0.16 });

    // Legs, splayed out from four points along the beam
    for (const x of [-beamHalf * 0.78, beamHalf * 0.78]) {
      for (const spread of [-legSpread, legSpread]) {
        g.moveTo(x, y);
        g.lineTo(x + (x < 0 ? -6 : 6), y + spread);
        g.stroke({ width: 5, color: 0x8a6a44 });
      }
    }

    // The beam itself
    g.roundRect(-beamHalf, y - 4, beamHalf * 2, 9, 3);
    g.fill(0xc19a63);
    g.roundRect(-beamHalf, y - 4, beamHalf * 2, 9, 3);
    g.stroke({ width: 1.5, color: 0x8a6a44 });
    // The worn stripe down the middle where everything gets cut
    g.moveTo(-beamHalf + 4, y + 0.5);
    g.lineTo(beamHalf - 4, y + 0.5);
    g.stroke({ width: 1, color: 0xa8834f, alpha: 0.8 });
  }
}
