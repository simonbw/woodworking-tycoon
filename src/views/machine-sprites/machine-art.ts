import { Container, Sprite, Texture } from "pixi.js";
import {
  IMAGE_PIXELS_PER_INCH,
  PIXELS_PER_CELL,
  PIXELS_PER_INCH,
} from "../shop-scale";
import { footprintCenter, Machine } from "../../game/Machine";
import { MachineActivity } from "./machine-activity";

/**
 * Shared plumbing for the imperative machine renderers — the engine-shell
 * port of `src/components/machine-sprites/` (see MachineView).
 *
 * Every art class draws in the old `LocalMachineSprite` coordinate frame:
 * machine-local pixels centered on the origin cell's center, rotated by
 * the owning view. Canvas-centered image art additionally offsets itself
 * to the footprint center (`footprintOffset`), exactly like the old
 * `FootprintArt` wrapper.
 */

/** The scale machine art is drawn at (see shop-scale's doc comment). */
export const IMAGE_SCALE = PIXELS_PER_INCH / IMAGE_PIXELS_PER_INCH;

/** A centered sprite of one of the preloaded art textures. */
export function artSprite(path: string, scale: number = IMAGE_SCALE): Sprite {
  const sprite = Sprite.from(Texture.from(path));
  sprite.anchor.set(0.5, 0.5);
  sprite.scale.set(scale);
  return sprite;
}

/** The footprint center in machine-local pixels — old `FootprintArt`. */
export function footprintOffset(machine: Machine): [number, number] {
  const [cx, cy] = footprintCenter(machine.type.cellsOccupied);
  return [cx * PIXELS_PER_CELL, cy * PIXELS_PER_CELL];
}

/** A container mounted on the machine's footprint center. */
export function footprintContainer(machine: Machine): Container {
  const container = new Container();
  const [x, y] = footprintOffset(machine);
  container.position.set(x, y);
  return container;
}

/**
 * A value that eases toward its target — the imperative stand-in for the
 * old sprites' react-spring defaults. Exponential approach at ~12/s reads
 * the same as the default spring at shop-floor zoom.
 */
export class Smoothed {
  target: number;

  constructor(
    public value: number = 0,
    private rate: number = 12,
  ) {
    this.target = value;
  }

  /** Jump straight to a value (initial layout, no travel to animate). */
  snap(value: number): void {
    this.value = value;
    this.target = value;
  }

  update(dt: number): void {
    this.value += (this.target - this.value) * Math.min(1, dt * this.rate);
  }
}

/**
 * What a machine art's per-frame pass gets to work with, besides the
 * machine itself: the effects overlay its cut spray draws into (a
 * machine-local graphics rendered on the "effects" layer, above every
 * machine — the old cutSprayLayer), and the machine-local → world-pixel
 * transform settling chips use to hand themselves to the dust floor.
 */
export interface EffectsFrame {
  readonly graphics: import("pixi.js").Graphics;
  toWorld(x: number, y: number): [number, number];
}

/**
 * One machine type's art. The skeleton is built in the constructor;
 * `rebuild` refreshes it for a new state snapshot (called only when the
 * entity's state object changes — a cheap identity compare per render),
 * and `animate` runs every frame for the parts that move continuously
 * (springs, vibration, cut spray).
 */
export abstract class MachineArtBase {
  readonly root = new Container();

  abstract rebuild(machine: Machine, activity: MachineActivity): void;

  animate(
    dt: number,
    machine: Machine,
    activity: MachineActivity,
    fx: EffectsFrame,
  ): void {
    void dt;
    void machine;
    void activity;
    void fx;
  }

  /** Drop every child (rebuild helpers that re-lay a section out). */
  protected clearContainer(container: Container): void {
    container
      .removeChildren()
      .forEach((child) => child.destroy({ children: true }));
  }
}
