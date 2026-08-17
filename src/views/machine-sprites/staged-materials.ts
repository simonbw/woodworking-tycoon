import { Container } from "pixi.js";
import { PIXELS_PER_INCH } from "../shop-scale";
import {
  benchPlacementFor,
  benchTopSizeIn,
} from "../../game/bench-work/bench-layout";
import { isBenchType, Machine } from "../../game/Machine";
import { buildMaterialSprite } from "./material-slot";

/**
 * A machine's staged stock — the old `MachineMaterials`: a bench's
 * pieces lying exactly where the bench layout says they lie, any other
 * machine's inputs and outputs fanned out on top of it, and the pieces
 * mid-operation gently rocking to show they're being worked on. The
 * rocking pauses while the machine is waiting for the player to come
 * back.
 *
 * The material drawings come through the material-sprite seam
 * (material-slot.ts); the placements and the rocking are all here.
 *
 * The old sprite also skipped drawing under the bench view's close-up
 * (the leaned-over bench draws its own live stock); the bench scene is
 * phase 7, so that guard returns with it.
 */
export class StagedMaterials {
  /** Mounts on the machine's footprint center, like the old FootprintArt. */
  readonly root = new Container();
  private processing: Array<{ container: Container; baseAngle: number }> = [];
  private wobblePhase = 0;

  rebuild(machine: Machine): void {
    this.root.removeChildren().forEach((child) => child.destroy());
    this.processing = [];

    if (isBenchType(machine.type)) {
      this.buildBenchTop(machine);
    } else {
      machine.inputMaterials.forEach((material, index) => {
        const holder = new Container();
        holder.angle = index * 10;
        const sprite = buildMaterialSprite(material);
        if (sprite) holder.addChild(sprite);
        this.root.addChild(holder);
      });
    }

    machine.processingMaterials.forEach((material, index) => {
      const holder = new Container();
      const baseAngle = index * 10;
      holder.angle = baseAngle;
      const sprite = buildMaterialSprite(material);
      if (sprite) holder.addChild(sprite);
      this.root.addChild(holder);
      this.processing.push({ container: holder, baseAngle });
    });

    // Bench outputs lie on the bench top through their placements; only
    // other machines fan theirs out
    if (!isBenchType(machine.type)) {
      machine.outputMaterials.forEach((material, index) => {
        const holder = new Container();
        holder.angle = index * 10 + 5;
        const sprite = buildMaterialSprite(material);
        if (sprite) holder.addChild(sprite);
        this.root.addChild(holder);
      });
    }
  }

  /**
   * A bench's staged stock, lying exactly where the bench layout says it
   * lies (bench-work/bench-layout.ts) — the same arrangement the bench
   * view shows, at shop-floor zoom. Positions are bench-top inches
   * converted to footprint-center-relative pixels.
   */
  private buildBenchTop(machine: Machine): void {
    const { widthIn, heightIn } = benchTopSizeIn(machine.type);
    for (const material of [
      ...machine.inputMaterials,
      ...machine.outputMaterials,
    ]) {
      const placement = benchPlacementFor(machine, material);
      const holder = new Container();
      holder.position.set(
        (placement.xIn - widthIn / 2) * PIXELS_PER_INCH,
        (placement.yIn - heightIn / 2) * PIXELS_PER_INCH,
      );
      holder.angle = placement.angleDeg;
      holder.scale.set(placement.flipped ? -1 : 1, 1);
      const sprite = buildMaterialSprite(material, {
        onEdge: placement.onEdge,
        flipped: placement.flipped,
      });
      if (sprite) holder.addChild(sprite);
      this.root.addChild(holder);
    }
  }

  /** Rock the pieces being worked on; frozen while `working` is false. */
  animate(dt: number, working: boolean): void {
    if (this.processing.length === 0) return;
    if (working) {
      this.wobblePhase = (this.wobblePhase + dt) % 0.8;
    }
    // The old sprite sprang between -2° and 2° every 400ms; a sine at the
    // same period and amplitude reads the same.
    const wobble = 2 * Math.sin((this.wobblePhase / 0.8) * Math.PI * 2);
    for (const { container, baseAngle } of this.processing) {
      container.angle = baseAngle + wobble;
    }
  }
}
