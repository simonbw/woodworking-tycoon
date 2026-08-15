import { Container, Graphics } from "pixi.js";
import { MaterialInstance } from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";
import { Smoothed } from "./machine-art";
import { buildMaterialSprite } from "./material-slot";

/** Covers everything a feeding board could sweep past the cut line. */
const MASK_EXTENT = 4096;

function drawHalfPlane(g: Graphics, side: number): void {
  g.clear();
  g.rect(
    -MASK_EXTENT / 2,
    side > 0 ? 0 : -MASK_EXTENT,
    MASK_EXTENT,
    MASK_EXTENT,
  );
  g.fill(0xffffff);
}

/**
 * A board mid-operation, feeding through a machine — the old
 * `FeedingBoard` component. Its position runs from the infeed spot to
 * the outfeed spot as the operation's progress goes 0 → 1. Progress
 * advances in whole ticks; the smoothing eases the steps into continuous
 * motion, and holds still while the operation is paused (progress
 * frozen) waiting for the player.
 *
 * With `exitedAs`, the board is split at the cut line (machine-local
 * y = 0): the portion still on the infeed side draws as `board`, the
 * portion past the cutter draws as `exitedAs` — so a freshly milled
 * surface emerges from the outfeed instead of popping in at completion.
 */
export class FeedingBoardArt {
  readonly root = new Container();
  private readonly moving = new Container();
  private readonly y = new Smoothed(0);
  private fromY = 0;
  private toY = 0;

  constructor(options: {
    board: MaterialInstance;
    /** How the board looks once it's been through the cutter. */
    exitedAs?: MaterialInstance;
    fraction: number;
    fromY: number;
    toY: number;
    x?: number;
    angle?: number;
    /** Override how the board is drawn (e.g. on edge against a fence). */
    sprite?: Container | null;
  }) {
    const { board, exitedAs, fraction, fromY, toY, x = 0, angle = 0 } = options;
    this.fromY = fromY;
    this.toY = toY;
    this.root.x = x;
    this.moving.angle = angle;
    this.y.snap(lerp(fromY, toY, fraction));
    this.moving.y = this.y.value;
    this.root.addChild(this.moving);

    const sprite =
      options.sprite !== undefined
        ? options.sprite
        : buildMaterialSprite(board);

    if (!exitedAs) {
      if (sprite) this.moving.addChild(sprite);
      return;
    }

    // Which side of the cut line the outfeed is on
    const outfeedSign = Math.sign(toY - fromY) || -1;

    // The masks live in machine space: the cut line stays put while the
    // board moves under it. Pixi excludes mask graphics from rendering.
    const infeedMask = new Graphics();
    drawHalfPlane(infeedMask, -outfeedSign);
    const outfeedMask = new Graphics();
    drawHalfPlane(outfeedMask, outfeedSign);
    this.root.addChild(infeedMask, outfeedMask);

    const infeedHolder = new Container();
    infeedHolder.mask = infeedMask;
    if (sprite) infeedHolder.addChild(sprite);
    const outfeedHolder = new Container();
    outfeedHolder.mask = outfeedMask;
    const exitedSprite = buildMaterialSprite(exitedAs);
    if (exitedSprite) outfeedHolder.addChild(exitedSprite);
    this.moving.addChild(infeedHolder, outfeedHolder);
  }

  /** Retarget from a fresh progress fraction (on state change). */
  setFraction(fraction: number): void {
    this.y.target = lerp(this.fromY, this.toY, fraction);
  }

  update(dt: number): void {
    this.y.update(dt);
    this.moving.y = this.y.value;
  }
}
