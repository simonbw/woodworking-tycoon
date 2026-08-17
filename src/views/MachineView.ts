import { Container, Graphics } from "pixi.js";
import { cellToPixelCenter } from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { Machine, MachineState } from "../game/Machine";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { createMachineArt } from "./machine-sprites/create-machine-art";
import {
  computeMachineActivity,
  MachineActivity,
} from "./machine-sprites/machine-activity";
import {
  EffectsFrame,
  footprintOffset,
  MachineArtBase,
} from "./machine-sprites/machine-art";
import {
  drawDustBag,
  drawOperationStatusBadge,
} from "./machine-sprites/machine-chrome";
import { buildWorktableShadow } from "./machine-sprites/WorktableArt";

/**
 * A machine standing on the shop floor — the old `MachineSprite` as a
 * view entity, dispatching to the per-type arts in `machine-sprites/`.
 *
 * Three sprites on two layers:
 *
 * - the machine itself on "machines" (worktable tops at a lower zIndex
 *   than everything else, so mounted benchtop machines sit on top; the
 *   layer sorts by zIndex — see config/layers.ts);
 * - a worktable's cast shadow on "machines" beneath every table's top
 *   (zIndex below them all), because a neighbour's shadow falling across
 *   the top you just butted against it would draw a seam that isn't
 *   there;
 * - the cut spray on "effects", above all the machines (the old
 *   cutSprayLayer), drawn in machine-local coordinates with the
 *   machine's transform copied over each frame.
 *
 * Static art rebuilds when the entity's state object changes — commands
 * and the machine system replace it immutably, so an identity compare
 * per render is enough. Running-state visuals (feeding stock, vibration,
 * spray, the status badge) re-read the world every frame.
 *
 * Not here on purpose: the targeting/tutorial highlight rims and the
 * invisible hit shapes — interaction chrome, phase 4 — and the
 * leaned-over-bench suppression, which returns with the bench scene in
 * phase 7.
 */

/** zIndex bands within the "machines" layer. */
const Z_SHADOW = 0;
const Z_WORKTABLE = 1;
const Z_MACHINE = 2;

export class MachineView extends BaseEntity implements Entity {
  private readonly root: Container & GameSprite;
  private readonly shadowHolder: Container & GameSprite;
  private readonly effects: Graphics & GameSprite;
  private readonly dustBag = new Graphics();
  private readonly badgeHolder = new Container();
  private readonly badge = new Graphics();

  private art: MachineArtBase | null = null;
  private artTypeId: string | null = null;
  private lastState: MachineState | null = null;
  private badgeKey = "";
  private readonly fx: EffectsFrame;

  constructor(private readonly entity: MachineEntity) {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "machines";
    this.shadowHolder = new Container() as Container & GameSprite;
    this.shadowHolder.layerName = "machines";
    this.shadowHolder.zIndex = Z_SHADOW;
    this.effects = new Graphics() as Graphics & GameSprite;
    this.effects.layerName = "effects";

    drawDustBag(this.dustBag);
    this.badgeHolder.addChild(this.badge);

    this.fx = {
      graphics: this.effects,
      toWorld: (x, y) => {
        const a = this.root.rotation;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return [
          this.root.x + x * cos - y * sin,
          this.root.y + x * sin + y * cos,
        ];
      },
    };

    this.sprites = [this.shadowHolder, this.root, this.effects];
  }

  /** The machine's own drawable — the container the highlight rims dress
   * (never the shadow or the spray). */
  get highlightRoot(): Container {
    return this.root;
  }

  @on("render")
  onRender(dt: number) {
    const state = this.entity.state;
    const machine = new Machine(state);
    const activity = computeMachineActivity(this.game, machine);

    if (state !== this.lastState) {
      this.lastState = state;
      this.rebuild(machine, activity);
    }

    // The badge floats over the footprint, counter-rotated so it reads
    // upright at any machine rotation; redrawn when its inputs change.
    const badgeKey = `${activity.isOperating}|${activity.needsYou}|${activity.fraction}|${activity.relevantPhase?.attended ?? ""}`;
    if (badgeKey !== this.badgeKey) {
      this.badgeKey = badgeKey;
      drawOperationStatusBadge(this.badge, activity);
    }

    // The spray draws fresh every frame, in machine-local coordinates
    // with the machine's transform.
    this.effects.clear();
    this.effects.position.copyFrom(this.root.position);
    this.effects.rotation = this.root.rotation;
    this.art?.animate(dt, machine, activity, this.fx);
  }

  private rebuild(machine: Machine, activity: MachineActivity): void {
    // A new machine type means new art wholesale; otherwise the art
    // refreshes in place so its eased values keep animating.
    if (!this.art || this.artTypeId !== machine.type.id) {
      this.art?.root.destroy({ children: true });
      this.art = createMachineArt(machine);
      this.artTypeId = machine.type.id;
      this.root.removeChildren();
      this.root.addChild(this.art.root);
      this.root.addChild(this.dustBag);
      this.root.addChild(this.badgeHolder);
      this.root.zIndex = machine.type.worktable ? Z_WORKTABLE : Z_MACHINE;

      this.shadowHolder.removeChildren().forEach((child) => child.destroy());
      const shadow = machine.type.worktable
        ? buildWorktableShadow(machine)
        : null;
      if (shadow) this.shadowHolder.addChild(shadow);
    }

    const [x, y] = cellToPixelCenter(machine.position);
    const angle = machine.rotation * -90;
    this.root.position.set(x, y);
    this.root.angle = angle;
    this.shadowHolder.position.set(x, y);
    this.shadowHolder.angle = angle;

    // A mounted dust bag hangs off the machine's corner
    const [fpX, fpY] = footprintOffset(machine);
    this.dustBag.position.set(fpX, fpY);
    this.dustBag.visible = machine.state.tools.includes("dustBag");
    this.badgeHolder.position.set(fpX, fpY);
    this.badgeHolder.angle = -angle;

    this.art.rebuild(machine, activity);
  }
}
