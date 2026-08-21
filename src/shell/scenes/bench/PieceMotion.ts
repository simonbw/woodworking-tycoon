import { ColorMatrixFilter, Container, Filter, Graphics } from "pixi.js";
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
import { MaterialInstance } from "../../../game/Materials";
import { drawContactShadow } from "../../../views/material-sprites/contactShadow";
import {
  createMaterialSprite,
  materialSpriteArt,
  materialSpriteShadow,
} from "../../../views/material-sprites/MaterialSprite";
import {
  drawMaterialShadow,
  materialShadowLook,
} from "../../../views/material-sprites/materialShadow";
import { PIXELS_PER_INCH } from "../../../views/shop-scale";
import { TARGET_HIGHLIGHT_FILTERS } from "../../../views/targetHighlight";
import { lerp } from "../../../utils/mathUtils";
import { StageFit, stepTurnSpring } from "./stageMath";

/**
 * The piece the hand is on, lit up: the shop's white targeting rim —
 * hugging the real alpha silhouette, wavy edges, miters and all, the
 * same treatment the floor gives the pile E would take — plus a lift in
 * brightness, because a rim alone gets lost against the busy grain. The
 * brightness is a filter rather than a tint: a Container tint multiplies,
 * so it can only darken. Shared instances, like the rim's own — pixi
 * filters hold no per-object state.
 */
const LIT_BRIGHTNESS = new ColorMatrixFilter();
LIT_BRIGHTNESS.brightness(1.15, false);
const LIT_FILTERS: Filter[] = [...TARGET_HIGHLIGHT_FILTERS, LIT_BRIGHTNESS];

/** How much a carried piece grows toward the eye — just enough to read
 * as coming off the surface. */
const CARRIED_LIFT = 1.04;
/** How high the hand holds a carried piece off the bench. The shadow
 * follows the one rule in contactShadow.ts — every inch of height buys
 * the same rim, evenly all around — so carrying adds these inches to
 * however the piece already stands. */
const CARRIED_LIFT_INCHES = 2.5;

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
  private lit = false;
  /** The hand has it off the surface: the art grows a hair and the
   * shadow spreads, springing back down when it's set down. The spring
   * runs on a 0–1 phase — the scale's own travel is far below the
   * spring's snap threshold. */
  private carried = false;
  private liftPhase = 0;
  private liftVelocity = 0;
  /** The tumble's three stop sprites, only for a board that tumbles. */
  private stopSprites: Container[] | null = null;
  /** Their one shared shadow, under them all — see the mount note. */
  private tumbleShadow: Graphics | null = null;
  /** How the piece lies, kept for the carry's shadow redraws. */
  private placementFlags: { onEdge?: boolean; onEnd?: boolean } = {};
  /** The lift the mounted shadow was last drawn at — the carry redraws
   * it (scaling would stretch the penumbra band unevenly), and at rest
   * nothing redraws at all. */
  private drawnLiftPhase = 0;
  private spriteKey = "";
  /** The instance the mounted sprites were drawn from, compared by
   * reference — see the note in `retarget`. */
  private drawn: MaterialInstance | null = null;
  private material: MaterialInstance | null = null;
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
    // its standing changes, face-down included — a pallet turned over
    // reorders its layers and shows the other nail heads.
    //
    // Materials are immutable, so a different instance is a different
    // drawing — compare by reference, not by id. Prying a nail out of a
    // pallet writes a new instance under the same id, and only the
    // reference compare notices.
    const spriteKey = tumbles(material)
      ? ""
      : `${placement.onEdge ? "e" : ""}${placement.onEnd ? "n" : ""}${placement.flipped ? "f" : ""}`;
    const fresh = this.drawn === null;
    if (material !== this.drawn || spriteKey !== this.spriteKey) {
      this.holder
        .removeChildren()
        .forEach((child) => child.destroy({ children: true }));
      // A tumbling board's shadow is the holder's, not the stops': the
      // three stop sprites ride non-uniform footprint scales mid-leg,
      // which would smear a baked shadow's rim, and two of them
      // crossfading would double it. One Graphics under them all,
      // redrawn at the footprint the tumble is passing through.
      this.tumbleShadow = tumbles(material)
        ? this.holder.addChild(new Graphics())
        : null;
      this.stopSprites = tumbles(material)
        ? FLIP_STOPS.map((stop) =>
            this.holder.addChild(
              createMaterialSprite(material, {
                onEdge: stop.onEdge,
                onEnd: stop.onEnd,
                shadow: false,
              }),
            ),
          )
        : null;
      if (!this.stopSprites) {
        this.holder.addChild(
          createMaterialSprite(material, {
            onEdge: placement.onEdge,
            onEnd: placement.onEnd,
            flipped: placement.flipped,
          }),
        );
      }
      this.spriteKey = spriteKey;
      this.drawn = material;
      // Fresh sprites carry base-state shadows and no filters: dress
      // the art, and let the next apply redraw a mid-carry shadow.
      this.drawnLiftPhase = 0;
      this.applyLit();
    }
    this.placementFlags = { onEdge: placement.onEdge, onEnd: placement.onEnd };
    this.material = material;
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

  /** Light the piece up (or put it out) — the hand is on it. */
  setLit(lit: boolean): void {
    if (lit === this.lit) return;
    this.lit = lit;
    this.applyLit();
  }

  /** The rim and brightness dress the wood alone: the shadow is a mark
   * on the bench, not part of the piece's silhouette, so the light
   * never traces it — the tumble's holder-level shadow included. */
  private applyLit(): void {
    for (const sprite of this.holder.children) {
      if (sprite === this.tumbleShadow) continue;
      const art = materialSpriteArt(sprite) ?? sprite;
      art.filters = this.lit ? LIT_FILTERS : [];
    }
  }

  /** Pick the piece up (or set it down) — the lift springs there. */
  setCarried(carried: boolean): void {
    if (carried === this.carried) return;
    this.carried = carried;
    if (reducedMotion()) {
      this.liftPhase = this.targetLiftPhase();
      this.liftVelocity = 0;
      this.apply();
    }
  }

  private targetLiftPhase(): number {
    return this.carried ? 1 : 0;
  }

  step(dt: number): void {
    if (
      this.xIn === this.targetXIn &&
      this.yIn === this.targetYIn &&
      this.angle === this.targetAngle &&
      this.flip === this.targetFlip &&
      this.phase === this.targetPhase &&
      this.liftPhase === this.targetLiftPhase()
    ) {
      return;
    }
    [this.liftPhase, this.liftVelocity] = stepTurnSpring(
      this.liftPhase,
      this.liftVelocity,
      this.targetLiftPhase(),
      dt,
    );
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

  private apply(): void {
    this.holder.position.set(
      this.originX + this.xIn * this.pxPerIn,
      this.originY + this.yIn * this.pxPerIn,
    );
    this.holder.angle = this.angle;
    this.holder.scale.set(this.flip * this.spriteScale, this.spriteScale);
    // The lift rides the sprites' layers, under whatever scale the
    // tumble puts on their roots: the wood grows a hair, and its shadow
    // is redrawn at the lifted footprint with the carry's inches — the
    // one height rule in contactShadow.ts spreads, fades, and softens
    // the pool, and redrawing keeps the penumbra band even where
    // scaling would stretch it.
    const lift = 1 + this.liftPhase * (CARRIED_LIFT - 1);
    const liftInches = this.liftPhase * CARRIED_LIFT_INCHES;
    for (const sprite of this.holder.children) {
      const art = materialSpriteArt(sprite);
      if (art) art.scale.set(lift);
    }
    if (this.liftPhase !== this.drawnLiftPhase && this.material) {
      this.drawnLiftPhase = this.liftPhase;
      for (const sprite of this.holder.children) {
        const shadow = materialSpriteShadow(sprite);
        if (!(shadow instanceof Graphics)) continue;
        shadow.clear();
        drawMaterialShadow(shadow, this.material, this.placementFlags, {
          liftInches,
          footprintScale: lift,
        });
      }
    }
    if (!this.stopSprites || !this.material) return;
    const frame = tumbleFrame(this.material, this.phase);
    // The tumble's one shadow, redrawn at the very footprint the board
    // is passing through (matched to the art's lift and bounce so the
    // fringe stays even), its spread blending between the stand heights
    // of the stop being left and the one being arrived at — a board
    // tipping onto its edge watches its shadow widen into the standing
    // spread instead of two baked shadows smearing through the
    // crossfade.
    if (this.tumbleShadow) {
      const from = materialShadowLook(
        this.material,
        FLIP_STOPS[frame.fromStop],
      );
      const to = materialShadowLook(this.material, FLIP_STOPS[frame.toStop]);
      const g = this.tumbleShadow;
      g.clear();
      if (from && to) {
        const w = frame.widthIn * PIXELS_PER_INCH * frame.lift * lift;
        const h = frame.heightIn * PIXELS_PER_INCH * frame.lift * lift;
        drawContactShadow(
          g,
          -w / 2,
          -h / 2,
          w,
          h,
          lerp(from.standInches, to.standInches, frame.fade),
          { liftInches },
        );
      }
    }
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
