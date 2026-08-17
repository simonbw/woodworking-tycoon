import { Container } from "pixi.js";
import { PIXELS_PER_CELL } from "../shop-scale";
import { Machine } from "../../game/Machine";
import { artSprite, MachineArtBase } from "./machine-art";
import { buildMaterialSprite } from "./material-slot";

/**
 * The garbage can — the old `GarbageCanSprite`: the can art with the
 * scrap tossed into it drawn small and faded on top, and anything mid-
 * disposal faded further and flushed red.
 */
export class GarbageCanArt extends MachineArtBase {
  private readonly contents = new Container();

  constructor() {
    super();
    // The can is centered on its 2×2-ft footprint, whose center sits half
    // a cell past the origin cell's center.
    const holder = new Container();
    holder.position.set(PIXELS_PER_CELL * 0.5, PIXELS_PER_CELL * 0.5);
    holder.addChild(artSprite("/images/garbage-can.png"));
    holder.addChild(this.contents);
    this.root.addChild(holder);
  }

  rebuild(machine: Machine): void {
    this.clearContainer(this.contents);
    machine.inputMaterials.forEach((material, index) => {
      const holder = new Container();
      holder.angle = index * 25 + 10;
      holder.scale.set(0.7);
      holder.alpha = 0.7;
      const sprite = buildMaterialSprite(material);
      if (sprite) holder.addChild(sprite);
      this.contents.addChild(holder);
    });
    machine.processingMaterials.forEach((material, index) => {
      const holder = new Container();
      holder.angle = index * 25 + 10;
      holder.scale.set(0.7);
      holder.alpha = 0.3;
      holder.tint = 0xff6666;
      const sprite = buildMaterialSprite(material);
      if (sprite) holder.addChild(sprite);
      this.contents.addChild(holder);
    });
  }
}
