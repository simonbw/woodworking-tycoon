import { Container, Graphics } from "pixi.js";
import { PIXELS_PER_CELL } from "../../components/shop-view/shop-scale";
import { Machine, MACHINE_TYPES } from "../../game/Machine";
import { colors } from "../../utils/colors";
import { colorToNumber } from "../../utils/colorUtils";
import { MachineActivity } from "./machine-activity";
import {
  artSprite,
  EffectsFrame,
  footprintContainer,
  MachineArtBase,
} from "./machine-art";
import { StagedMaterials } from "./staged-materials";

/**
 * The stations whose art is just a body with staged stock on top: the
 * makeshift workbench (the plywood-on-buckets art — this was the
 * makeshift bench's sprite; the bench identity moved to the starting
 * station, see machines/workspace.ts), and the brown-square fallback
 * for any machine type without art of its own.
 */
export class SimpleStationArt extends MachineArtBase {
  private readonly materials = new StagedMaterials();

  constructor(machine: Machine) {
    super();
    const holder = footprintContainer(machine);
    holder.addChild(this.buildBody(machine));
    holder.addChild(this.materials.root);
    this.root.addChild(holder);
  }

  private buildBody(machine: Machine): Container {
    if (machine.type.id === MACHINE_TYPES.workspace.id) {
      return artSprite("/images/makeshift-bench.png");
    }
    const g = new Graphics();
    g.rect(
      -PIXELS_PER_CELL / 2,
      -PIXELS_PER_CELL / 2,
      PIXELS_PER_CELL,
      PIXELS_PER_CELL,
    );
    g.fill(colorToNumber(colors.brown["900"]));
    return g;
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
