import { Container } from "pixi.js";
import { BenchPlacement } from "../../../game/bench-work/bench-layout";
import {
  advanceFlipPhase,
  FLIP_LEG_SECONDS,
  FLIP_STOPS,
  flipStopOf,
  flipStopSize,
  tumbleFrame,
  tumbles,
} from "../../../game/bench-work/flip-cycle";
import { placedPieceSize } from "../../../game/bench-work/workpiece";
import { MaterialInstance } from "../../../game/Materials";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { StageFit, stepTurnSpring } from "./stageMath";

/** Motion the player has asked not to see is pinned, not played — which
 * is also how the E2E suite runs, so its assertions land on end states. */
function reducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/**
 * One piece's standing holder: position, the turn (R), and the
 * face-for-face flip ease in on the spring — the old scene's
 * TweenedTransform — and a board going over on F plays the tumble:
 * all three of its stops (flat, on edge, on end) stay mounted at once,
 * and each frame cross-fades the stop being left into the one being
 * arrived at while both are drawn at the footprint the tumble is
 * passing through, so F reads as the piece being tipped by hand instead
 * of swapping sprites. The cycle, the footprints, and the easing all
 * come from `bench-work/flip-cycle`; this only ticks the phase and
 * pushes the result at PIXI.
 *
 * Both bench views share the class: the dive view keeps one per piece
 * lying on the tops, the arranging view runs one under the hand — and
 * hands it over on release, so a drop that snaps into a seat springs
 * there on the same holder instead of teleporting.
 */
export class PieceMotion {
  readonly holder = new Container();
  /** The tumble's three stop sprites, only for a board that tumbles. */
  private stopSprites: Container[] | null = null;
  private spriteKey = "";
  private material: MaterialInstance | null = null;
  private placement: BenchPlacement | null = null;
  private originX = 0;
  private originY = 0;
  private pxPerIn = 1;
  private spriteScale = 1;
  private xIn = 0;
  private xVelocity = 0;
  private targetXIn = 0;
  private yIn = 0;
  private yVelocity = 0;
  private targetYIn = 0;
  private angle = 0;
  private angleVelocity = 0;
  private targetAngle = 0;
  private flip = 1;
  private flipVelocity = 0;
  private targetFlip = 1;
  /** Accumulated tumble phase — see `flip-cycle` for why it only grows. */
  private phase = 0;
  private targetPhase = 0;

  retarget(
    material: MaterialInstance,
    placement: BenchPlacement,
    fit: StageFit,
    opts: {
      /** Track the target position directly — the piece riding the hand
       * goes where the hand is, with no spring lag. */
      snapPosition?: boolean;
    } = {},
  ): void {
    // A tumbling board keeps one holder across all three stops (the
    // tumble is the motion between them); everything else redraws when
    // its standing changes.
    const spriteKey = tumbles(material)
      ? material.id
      : `${material.id}|${placement.onEdge ? "e" : ""}${placement.onEnd ? "n" : ""}`;
    const fresh = this.spriteKey === "";
    if (spriteKey !== this.spriteKey) {
      this.holder
        .removeChildren()
        .forEach((child) => child.destroy({ children: true }));
      this.stopSprites = tumbles(material)
        ? FLIP_STOPS.map((stop) =>
            this.holder.addChild(
              createMaterialSprite(material, {
                onEdge: stop.onEdge,
                onEnd: stop.onEnd,
              }),
            ),
          )
        : null;
      if (!this.stopSprites) {
        this.holder.addChild(
          createMaterialSprite(material, {
            onEdge: placement.onEdge,
            onEnd: placement.onEnd,
          }),
        );
      }
      this.spriteKey = spriteKey;
    }
    this.material = material;
    this.placement = placement;
    this.originX = fit.originX;
    this.originY = fit.originY;
    this.pxPerIn = fit.pxPerIn;
    this.spriteScale = fit.spriteScale;
    this.targetXIn = placement.xIn;
    this.targetYIn = placement.yIn;
    this.targetAngle = placement.angleDeg;
    this.targetFlip = placement.flipped ? -1 : 1;
    if (tumbles(material)) {
      // Advancing onto a stop already reached is a no-op, so retargeting
      // every redraw never double-steps the cycle.
      this.targetPhase = advanceFlipPhase(
        this.targetPhase,
        flipStopOf(placement),
      );
    }
    if (fresh || reducedMotion()) {
      // A piece that just appeared lies where it lies — only later
      // gestures play as motion.
      this.xIn = this.targetXIn;
      this.yIn = this.targetYIn;
      this.angle = this.targetAngle;
      this.flip = this.targetFlip;
      this.phase = this.targetPhase;
      this.xVelocity = 0;
      this.yVelocity = 0;
      this.angleVelocity = 0;
      this.flipVelocity = 0;
    } else if (opts.snapPosition) {
      this.xIn = this.targetXIn;
      this.yIn = this.targetYIn;
      this.xVelocity = 0;
      this.yVelocity = 0;
    }
    this.apply();
  }

  step(dt: number): void {
    if (
      this.xIn === this.targetXIn &&
      this.yIn === this.targetYIn &&
      this.angle === this.targetAngle &&
      this.flip === this.targetFlip &&
      this.phase === this.targetPhase
    ) {
      return;
    }
    [this.xIn, this.xVelocity] = stepTurnSpring(
      this.xIn,
      this.xVelocity,
      this.targetXIn,
      dt,
    );
    [this.yIn, this.yVelocity] = stepTurnSpring(
      this.yIn,
      this.yVelocity,
      this.targetYIn,
      dt,
    );
    [this.angle, this.angleVelocity] = stepTurnSpring(
      this.angle,
      this.angleVelocity,
      this.targetAngle,
      dt,
    );
    [this.flip, this.flipVelocity] = stepTurnSpring(
      this.flip,
      this.flipVelocity,
      this.targetFlip,
      dt,
    );
    // Capped like the springs: a long frame plays at most 50ms of
    // tumble instead of jumping a leg at once.
    this.phase = Math.min(
      this.targetPhase,
      this.phase + Math.min(dt, 0.05) / FLIP_LEG_SECONDS,
    );
    this.apply();
  }

  /** Where the piece appears right now — the sprung position and angle
   * on the committed placement, for chrome that follows the motion. */
  apparentPlacement(): BenchPlacement | null {
    if (!this.placement) return null;
    return {
      ...this.placement,
      xIn: this.xIn,
      yIn: this.yIn,
      angleDeg: this.angle,
    };
  }

  /** The footprint the piece appears to cover right now, mid-tumble
   * swell included, in inches. */
  apparentSizeIn(): { widthIn: number; heightIn: number } | null {
    if (!this.material || !this.placement) return null;
    if (!tumbles(this.material)) {
      return placedPieceSize(this.material, this.placement);
    }
    const frame = tumbleFrame(this.material, this.phase);
    return {
      widthIn: frame.widthIn * frame.lift,
      heightIn: frame.heightIn * frame.lift,
    };
  }

  private apply(): void {
    this.holder.position.set(
      this.originX + this.xIn * this.pxPerIn,
      this.originY + this.yIn * this.pxPerIn,
    );
    this.holder.angle = this.angle;
    this.holder.scale.set(this.flip * this.spriteScale, this.spriteScale);
    if (!this.stopSprites || !this.material) return;
    const frame = tumbleFrame(this.material, this.phase);
    this.stopSprites.forEach((sprite, stop) => {
      const showing =
        stop === frame.fromStop
          ? 1 - frame.fade
          : stop === frame.toStop
            ? frame.fade
            : 0;
      sprite.visible = showing > 0.001;
      if (!sprite.visible) return;
      sprite.alpha = showing;
      // Each stop's sprite draws its own footprint, so matching the
      // apparent one is a plain ratio of inches.
      const own = flipStopSize(this.material!, stop);
      sprite.scale.set(
        (frame.widthIn / own.widthIn) * frame.lift,
        (frame.heightIn / own.heightIn) * frame.lift,
      );
    });
  }
}
