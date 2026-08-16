import { Graphics } from "pixi.js";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import {
  dwellGain,
  strokeGain,
} from "../../../components/bench-view/stageMath";
import { GroupPiece } from "../../../game/bench-work/bench-group";
import {
  benchPointInFrame,
  framePointOnBench,
} from "../../../game/bench-work/bench-layout";
import {
  CoverageGrid,
  coverageComplete,
  coverageProgress,
  makeCoverageGrid,
  stampStroke,
} from "../../../game/bench-work/coverage";
import { toolOperationFor } from "../../../game/bench-work/tool-work";
import {
  placedPieceSize,
  StrokeScript,
} from "../../../game/bench-work/workpiece";
import { Machine, machineKey, Operation } from "../../../game/Machine";
import { gatherBenchPieces } from "../../../sim/commands/bench-commands";
import {
  finishAttendedWork,
  operateMachine,
} from "../../../sim/commands/machine-commands";
import { projectGameState } from "../../../sim/projection";
import { ShellStore } from "../../ShellStore";
import { BenchDive } from "./BenchDive";
import { foleyClipFor, WorkFoley } from "./WorkFoley";
import {
  benchStage,
  benchWork,
  openBenchGroup,
  PieceSpot,
  pieceUnder,
  stagePointer,
  workpieceSpot,
} from "./benchStage";

/**
 * Stroke work — sanding, planing, and spreading finish, the second of
 * the bench's gestures (migration phase 7). The tool in hand plus the
 * piece under it IS the operation (`toolOperationFor`, shared and
 * unit-tested): the sanding block strokes the very piece it's over, and
 * how the piece lies picks between a plane's jobs.
 *
 * Pressing claims the piece (`operateMachine` with the tool claim, the
 * old BenchToolClaim path) and dragging lays coverage down through the
 * shared grid; the mask over the piece is what "how far along" looks
 * like. Coverage is ephemeral (decision 3): it lives as long as the
 * player is leaned over the bench, and standing up (or reloading)
 * starts the pass over — the commit only fires when the grid fills, and
 * that's `finishAttendedWork`.
 *
 * A powered tool keeps cutting where it rests (the orbit sander's
 * orbit); an unpowered one only cuts while it moves.
 */

const MASK = 0xf0e6d2;

/** How long after the last stroke the tool's foley keeps running — the
 * old surface's activity hold, so a stroke's rhythm doesn't stutter. */
const FOLEY_HOLD_SECONDS = 0.18;

/** How far the hand must travel before it counts as a stroke, in
 * inches — the old surface's threshold, so a resting hand on an
 * unpowered tool lays nothing down. */
const STROKE_MIN_TRAVEL_IN = 0.05;

interface StrokePass {
  readonly pieceId: string;
  readonly operation: Operation;
  readonly grid: CoverageGrid;
  /** Where the tool last was, in piece-local inches — null between
   * strokes (the hand lifted, or off the piece), so the next touch
   * starts a fresh segment instead of sweeping across the gap. */
  last: { xIn: number; yIn: number } | null;
}

export class BenchStrokeView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private mask: Graphics & GameSprite;
  private pass: StrokePass | null = null;
  /** The tool's own continuous voice, and how long since it last cut. */
  private foley = new WorkFoley();
  private sinceWork = Infinity;

  /** How far the pass in progress has got, 0..1 (null when idle) — the
   * same seam `piecePoints` gives the stage: a test watches the real
   * coverage instead of counting mouse moves. */
  strokeProgress(): number | null {
    return this.pass ? coverageProgress(this.pass.grid) : null;
  }

  constructor() {
    super();
    this.mask = new Graphics() as Graphics & GameSprite;
    this.mask.layerName = "hud";
    this.sprite = this.mask;
  }

  private dive(): BenchDive | undefined {
    return this.game.entities.tryGetSingleton(BenchDive);
  }

  /** The pointer in bench-frame inches, or null with no stage. */
  private pointerInches(): { xIn: number; yIn: number } | null {
    const stage = benchStage(this.game);
    return stage ? stagePointer(this.game, stage.fit) : null;
  }

  /** The piece under the pointer, top of the stack first. */
  private pieceUnder(xIn: number, yIn: number): GroupPiece | null {
    const group = openBenchGroup(this.game)?.group;
    return group ? pieceUnder(group, xIn, yIn) : null;
  }

  /**
   * The stroke this held tool offers on that piece, or null. The tool
   * hangs on the bench the player opened, so that's the machine whose
   * operations it can run — even when the wood is lying on the table
   * next to it.
   */
  private strokeOffer(piece: GroupPiece): Operation | null {
    const dive = this.dive();
    const opened = openBenchGroup(this.game)?.opened;
    if (!dive?.heldTool || !opened) return null;
    const operation = toolOperationFor(
      opened,
      projectGameState(this.game).progression,
      dive.heldTool,
      piece.material,
      piece.placement,
    );
    return operation?.interaction?.kind === "stroke" ? operation : null;
  }

  /**
   * The bench run's current script. While an operation runs, the
   * workpiece lives in the operation rather than on the pile — the
   * script is what knows where the work actually is (workpiece.ts).
   */
  private strokeScript(): { machine: Machine; script: StrokeScript } | null {
    const work = benchWork(this.game);
    return work?.script.kind === "stroke"
      ? { machine: work.machine, script: work.script }
      : null;
  }

  /** Where the script's workpiece lies, in the group's frame. */
  private workpieceSpot(
    machine: Machine,
    script: StrokeScript,
  ): PieceSpot | null {
    const group = openBenchGroup(this.game)?.group;
    return group ? workpieceSpot(group, machine, script.workpiece) : null;
  }

  @on("tick")
  onTick(dt: number) {
    this.sinceWork += dt;
    const dive = this.dive();
    const bench = dive?.openBench();
    if (!dive || !bench) {
      this.pass = null;
      this.foley.stop();
      return;
    }
    // The tool's own voice runs while it is cutting and hangs on for a
    // moment after, so a stroke's rhythm doesn't stutter it.
    this.foley.set(
      this.pass && this.sinceWork < FOLEY_HOLD_SECONDS
        ? foleyClipFor(this.pass.operation.id)
        : null,
    );
    const at = this.pointerInches();
    const down = this.game.io.lmb;

    // The pass outlives letting go: the mask is the work done so far on
    // this piece, and the hand comes off it between strokes. Lifting
    // only breaks the segment, so the next touch doesn't sweep across
    // the gap.
    if (!down) {
      if (this.pass) this.pass.last = null;
      return;
    }
    if (!at) return;

    // Start a pass on the press: the claim takes exactly the piece the
    // tool is over (tool-first), and the operation swallows it.
    if (!this.pass) {
      // A pass already running on this bench (the player stood up and
      // came back to it) resumes rather than re-claiming: the operation
      // still holds the workpiece, and the mask restarts from zero —
      // coverage is ephemeral (decision 3).
      const running = this.strokeScript();
      if (running?.script.started) {
        const spot = this.workpieceSpot(running.machine, running.script);
        if (!spot) return;
        const local = benchPointInFrame(
          spot.placement,
          spot.size,
          at.xIn,
          at.yIn,
        );
        if (
          local.xIn < 0 ||
          local.yIn < 0 ||
          local.xIn > spot.size.widthIn ||
          local.yIn > spot.size.heightIn
        ) {
          return;
        }
        this.pass = {
          pieceId: spot.id,
          operation: running.script.operation,
          grid: makeCoverageGrid(spot.size.widthIn, spot.size.heightIn),
          last: local,
        };
        this.game.entities.tryGetSingleton(ShellStore)?.bump();
        return;
      }
      const piece = this.pieceUnder(at.xIn, at.yIn);
      if (!piece) return;
      const operation = this.strokeOffer(piece);
      if (!operation) return;
      // The wood may be lying on the next table over; the tool and the
      // operation are this bench's, so slide it across first.
      if (machineKey(piece.member.machine.state) !== machineKey(bench.state)) {
        gatherBenchPieces(this.game, bench, [piece.material.id]);
      }
      if (
        !operateMachine(this.game, bench, {
          operationId: operation.id,
          materialId: piece.material.id,
        })
      ) {
        return;
      }
      const size = placedPieceSize(piece.material, piece.placement);
      this.pass = {
        pieceId: piece.material.id,
        operation,
        grid: makeCoverageGrid(size.widthIn, size.heightIn),
        last: benchPointInFrame(piece.placement, size, at.xIn, at.yIn),
      };
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
      return;
    }

    // Lay the stroke down. The workpiece is inside the running
    // operation now, so the script — not the pile — says where it lies.
    const running = this.strokeScript();
    const spot = running
      ? this.workpieceSpot(running.machine, running.script)
      : null;
    if (!spot || spot.id !== this.pass.pieceId) {
      this.pass = null;
      return;
    }
    const local = benchPointInFrame(spot.placement, spot.size, at.xIn, at.yIn);
    const interaction = this.pass.operation.interaction;
    if (interaction?.kind !== "stroke") return;
    const radiusIn = interaction.brushWidthIn / 2;
    // A brush's width off the piece still works its edge; further out
    // the tool is off the wood, and the segment breaks there.
    if (
      local.xIn < -radiusIn ||
      local.yIn < -radiusIn ||
      local.xIn > spot.size.widthIn + radiusIn ||
      local.yIn > spot.size.heightIn + radiusIn
    ) {
      this.pass.last = null;
      return;
    }
    const last = this.pass.last;
    if (!last) {
      this.pass.last = local;
      return;
    }
    const distance = Math.hypot(local.xIn - last.xIn, local.yIn - last.yIn);
    const dtMs = dt * 1000;
    // The same gain math the old surface used, so the tool tiers feel
    // the way they were tuned: a slow deliberate stroke saturates as it
    // goes, a fast scrub spreads the same work thin.
    if (distance >= STROKE_MIN_TRAVEL_IN) {
      stampStroke(
        this.pass.grid,
        last.xIn,
        last.yIn,
        local.xIn,
        local.yIn,
        radiusIn,
        strokeGain(interaction.coveragePerSecond, radiusIn, distance, dtMs),
      );
      this.pass.last = local;
      this.sinceWork = 0;
    } else if (interaction.powered) {
      // A powered pad keeps cutting the spot it rests on; a block only
      // cuts while it moves.
      stampStroke(
        this.pass.grid,
        local.xIn,
        local.yIn,
        local.xIn,
        local.yIn,
        radiusIn,
        dwellGain(interaction.coveragePerSecond, radiusIn, dtMs),
      );
      this.sinceWork = 0;
    }

    if (coverageComplete(this.pass.grid)) {
      finishAttendedWork(this.game, bench);
      this.pass = null;
      this.foley.stop();
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
    }
  }

  @on("render")
  onRender() {
    const g = this.mask;
    g.clear();
    const fit = benchStage(this.game)?.fit;
    if (!fit) return;

    // The pass in progress: the worked area brightening over the piece.
    if (this.pass) {
      const running = this.strokeScript();
      const spot = running
        ? this.workpieceSpot(running.machine, running.script)
        : null;
      if (spot) {
        const progress = coverageProgress(this.pass.grid);
        const points = cornerPoints(spot.placement, spot.size, fit);
        g.poly(points).fill({ color: MASK, alpha: 0.15 + progress * 0.4 });
        g.poly(points).stroke({ width: 2, color: MASK, alpha: 0.8 });
      }
      return;
    }

    // Idle: the piece the held tool would work wears a hairline.
    const at = this.pointerInches();
    if (!at) return;
    const piece = this.pieceUnder(at.xIn, at.yIn);
    if (!piece || !this.strokeOffer(piece)) return;
    const size = placedPieceSize(piece.material, piece.placement);
    g.poly(cornerPoints(piece.placement, size, fit)).stroke({
      width: 2,
      color: MASK,
      alpha: 0.55,
    });
  }
}

/** A placed piece's four corners on the stage, in screen px. */
function cornerPoints(
  placement: Parameters<typeof framePointOnBench>[0],
  size: { widthIn: number; heightIn: number },
  fit: { originX: number; originY: number; pxPerIn: number },
): number[] {
  const corners: Array<[number, number]> = [
    [0, 0],
    [size.widthIn, 0],
    [size.widthIn, size.heightIn],
    [0, size.heightIn],
  ];
  return corners.flatMap(([lx, ly]) => {
    const at = framePointOnBench(placement, size, lx, ly);
    return [
      fit.originX + at.xIn * fit.pxPerIn,
      fit.originY + at.yIn * fit.pxPerIn,
    ];
  });
}
