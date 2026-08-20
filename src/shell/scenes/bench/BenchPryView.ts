import { Graphics } from "pixi.js";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity, GameEventMap } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import {
  benchPlacementFor,
  benchPointOnPallet,
  palletPointOnBench,
} from "../../../game/bench-work/bench-layout";
import {
  faceNails,
  isSameNail,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletNailPosition,
} from "../../../game/bench-work/pallet-geometry";
import { Pallet, PalletNail } from "../../../game/Materials";
import {
  arrangeBenchMaterial,
  pryPalletNail,
} from "../../../sim/commands/bench-commands";
import { ShellStore } from "../../ShellStore";
import { BenchDive } from "./BenchDive";
import { BenchDiveView } from "./BenchDiveView";
import { benchStage, stagePointer, stageSettled } from "./benchStage";

/**
 * Pry mode — the first of the bench's gestures (migration phase 7). A
 * staged pallet offers its nails to the hammer with no plan selected
 * (docs/bench-work.md decision 0): every nail on the shown face wears a
 * "pry here" ring while the hammer is in hand, the one under the
 * pointer warms and widens, and the press is the commit — one
 * `pryPalletNail`, which drops the nail in the shop's tin and frees any
 * board that just lost its last one (decision 4: work that grants
 * resources commits incrementally).
 *
 * The claw's lever line plays out over the empty hole after the pull,
 * so the gesture reads as a pull rather than a vanishing.
 */

/** How far a click may miss a nail and still mean it, in pallet inches. */
const NAIL_HIT_RADIUS_IN = 3.5;

/** How long the claw's lever line lingers after a pull. */
const PRY_ANIMATION_SECONDS = 0.22;

const RING = 0xf5efe3;
const RING_WARM = 0xd97c26;
const CLAW = 0x8a8378;

export class BenchPryView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private rings: Graphics & GameSprite;

  constructor() {
    super();
    this.rings = new Graphics() as Graphics & GameSprite;
  }

  onAdd() {
    // Draw into the dive's own frame, so the lean-in carries every
    // surface on the stage as one picture.
    this.game.entities.getSingleton(BenchDiveView).frame.addChild(this.rings);
  }

  private dive(): BenchDive | undefined {
    return this.game.entities.tryGetSingleton(BenchDive);
  }

  /**
   * Where the shown face's nails sit on screen right now — the pry
   * side of `piecePoints`: a spec aims at a real ring instead of
   * sweeping the stage for one.
   */
  nailPoints(): ReadonlyArray<{ nail: PalletNail; x: number; y: number }> {
    const staged = this.stagedPallet();
    const fit = benchStage(this.game)?.fit;
    if (!staged || !fit) return [];
    return faceNails(staged.pallet, staged.placement.flipped).map((nail) => {
      const local = palletNailPosition(nail);
      const at = palletPointOnBench(staged.placement, local.xIn, local.yIn);
      return {
        nail,
        x: fit.originX + at.xIn * fit.pxPerIn,
        y: fit.originY + at.yIn * fit.pxPerIn,
      };
    });
  }

  /**
   * The staged pallet's top-left corner, in the run's frame — where a
   * spec starts measuring to aim at a board rather than a nail.
   */
  palletCorner(): { xIn: number; yIn: number } | null {
    const staged = this.stagedPallet();
    if (!staged) return null;
    return {
      xIn: staged.placement.xIn - PALLET_WIDTH_IN / 2,
      yIn: staged.placement.yIn - PALLET_HEIGHT_IN / 2,
    };
  }

  /** The pallet staged on the opened bench, with where it lies. */
  private stagedPallet(): {
    pallet: Pallet;
    placement: ReturnType<typeof benchPlacementFor>;
  } | null {
    const dive = this.dive();
    const bench = dive?.openBench();
    if (!bench) return null;
    const pallet = bench.state.inputMaterials.find(
      (material) => material.type === "pallet",
    );
    if (!pallet || pallet.type !== "pallet") return null;
    return {
      pallet,
      placement: benchPlacementFor(bench.view(), pallet),
    };
  }

  /** The nail nearest the pointer, in bench-frame inches. Nearest wins:
   * neighboring crossings can sit closer together than the hit radius,
   * and the pointer means the closest one. */
  private nailAt(xIn: number, yIn: number): PalletNail | null {
    const staged = this.stagedPallet();
    const dive = this.dive();
    if (!staged || !dive) return null;
    const local = benchPointOnPallet(staged.placement, xIn, yIn);
    let best: PalletNail | null = null;
    let bestDist = NAIL_HIT_RADIUS_IN;
    for (const nail of faceNails(staged.pallet, staged.placement.flipped)) {
      const at = palletNailPosition(nail);
      const dist = Math.hypot(at.xIn - local.xIn, at.yIn - local.yIn);
      if (dist <= bestDist) {
        best = nail;
        bestDist = dist;
      }
    }
    return best;
  }

  /** The pointer in bench-frame inches, or null off the stage. */
  private pointerInches(): { xIn: number; yIn: number } | null {
    const stage = benchStage(this.game);
    return stage ? stagePointer(this.game, stage.fit) : null;
  }

  /** Whether the hammer is the tool in hand. */
  private hammerHeld(): boolean {
    return this.dive()?.heldTool === "hammer";
  }

  @on("tick")
  onTick() {
    const dive = this.dive();
    if (!dive || !dive.settled()) return;
    if (!this.hammerHeld() || dive.prying) {
      if (dive.hoveredNail !== null) dive.hoveredNail = null;
      return;
    }
    const at = this.pointerInches();
    dive.hoveredNail = at ? this.nailAt(at.xIn, at.yIn) : null;
  }

  @on("click")
  onClick() {
    const dive = this.dive();
    const bench = dive?.openBench();
    if (!dive || !bench || !dive.settled()) return;
    if (!this.hammerHeld() || dive.prying) return;
    const at = this.pointerInches();
    const nail = at ? this.nailAt(at.xIn, at.yIn) : null;
    if (!nail) return;
    // The press is the commit: one command frees the board AND seats it.
    if (pryPalletNail(this.game, bench, nail)) {
      dive.prying = { nail, secondsLeft: PRY_ANIMATION_SECONDS };
      dive.hoveredNail = null;
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
    }
  }

  /**
   * F turns the pallet over: bare-handed with the pointer on it, or with
   * the hammer in hand anywhere on the stage — the rest of the nails are
   * on the other side, and putting the hammer down to turn it would be
   * a step for nothing.
   */
  @on("keyDown")
  onKeyDown({ key, event }: GameEventMap["keyDown"]) {
    if (key !== "KeyF") return;
    if (!stageSettled(this.game)) return;
    const dive = this.dive();
    const bench = dive?.openBench();
    const staged = this.stagedPallet();
    if (!bench || !staged) return;
    if (!this.hammerHeld()) {
      // Bare hands: only the pallet under the pointer turns over, so F
      // over a board still means that board.
      if (dive?.handsFull()) return;
      const at = this.pointerInches();
      if (!at) return;
      const local = benchPointOnPallet(staged.placement, at.xIn, at.yIn);
      if (
        local.xIn < 0 ||
        local.yIn < 0 ||
        local.xIn > PALLET_WIDTH_IN ||
        local.yIn > PALLET_HEIGHT_IN
      ) {
        return;
      }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    arrangeBenchMaterial(this.game, bench, staged.pallet.id, {
      ...staged.placement,
      flipped: !staged.placement.flipped,
    });
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  @on("render")
  onRender() {
    const g = this.rings;
    g.clear();
    const dive = this.dive();
    const fit = benchStage(this.game)?.fit;
    const staged = this.stagedPallet();
    if (!dive || !fit || !staged) return;

    const toStage = (nail: PalletNail) => {
      const local = palletNailPosition(nail);
      const at = palletPointOnBench(staged.placement, local.xIn, local.yIn);
      return {
        x: fit.originX + at.xIn * fit.pxPerIn,
        y: fit.originY + at.yIn * fit.pxPerIn,
      };
    };

    if (this.hammerHeld()) {
      for (const nail of faceNails(staged.pallet, staged.placement.flipped)) {
        const { x, y } = toStage(nail);
        if (isSameNail(dive.hoveredNail, nail)) {
          // The hammer is over this one: the ring warms and widens.
          g.circle(x, y, 9).fill({ color: RING_WARM, alpha: 0.2 });
          g.circle(x, y, 9).stroke({ width: 3, color: RING_WARM, alpha: 1 });
        } else {
          g.circle(x, y, 7).stroke({ width: 2.5, color: RING, alpha: 0.95 });
        }
      }
    }

    if (dive.prying) {
      // The pull in progress: the press already committed, so the nail
      // is gone from the pallet — the widened ring and the claw's lever
      // line play out over the empty hole.
      const { x, y } = toStage(dive.prying.nail);
      g.circle(x, y, 10).stroke({ width: 2.5, color: RING_WARM, alpha: 0.95 });
      g.moveTo(x, y)
        .lineTo(x + 16, y - 22)
        .stroke({ width: 3.5, color: CLAW, alpha: 0.9 });
    }
  }
}
