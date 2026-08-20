import { Container, Graphics } from "pixi.js";
import { StageFit } from "./stageMath";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity, GameEventMap } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { GroupPiece } from "../../../game/bench-work/bench-group";
import {
  BenchPlacement,
  benchPointInFrame,
  framePointOnBench,
} from "../../../game/bench-work/bench-layout";
import {
  KerfMask,
  kerfComplete,
  kerfFraction,
  makeKerfMask,
  sawStroke,
} from "../../../game/bench-work/coverage";
import {
  nearestSawMark,
  sawMarkParameters,
  toolOperationFor,
} from "../../../game/bench-work/tool-work";
import {
  placedPieceSize,
  SawScript,
  sawCrossSection,
  sawLineFraction,
} from "../../../game/bench-work/workpiece";
import { Machine, machineKey, Operation } from "../../../game/Machine";
import { SAW_ANGLE_STOPS } from "../../../game/machines/miterSaw";
import { materialDustSpecies } from "../../../game/material-helpers";
import { Board } from "../../../game/Materials";
import { TOOL_TYPES } from "../../../game/Tool";
import {
  emitBenchDust,
  gatherBenchPieces,
} from "../../../sim/commands/bench-commands";
import {
  finishAttendedWork,
  operateMachine,
  setMachineSettings,
} from "../../../sim/commands/machine-commands";
import { projectProgression } from "../../../sim/projection";
import { ShellStore } from "../../ShellStore";
import { BenchDustThrottle } from "./benchDust";
import { BenchDive } from "./BenchDive";
import { BenchDiveView } from "./BenchDiveView";
import {
  benchStage,
  benchWork,
  openBenchGroup,
  PieceSpot,
  pieceUnder,
  stagePointer,
  stageSettled,
  workpieceSpot,
} from "./benchStage";
import { HandSawVoice, playSawPartCrack } from "../../../utils/handSawSynth";
import { KerfDust } from "./KerfDust";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";

/**
 * The hand saw, in place: the mark, then the kerf, on the board exactly
 * where it lies (migration phase 7's second tool gesture). With the saw
 * in hand a pencil line follows the pointer along the half-foot detents
 * (`nearestSawMark`), slanted by the angle stop that R swings, and the
 * press commits it — the operation starts with that cut's parameters,
 * which is what claims the board.
 *
 * Once it's marked, push–pull strokes along the line deepen a kerf mask
 * scaled to the stock's cross-section, and the cut reads spatially: the
 * dark kerf eats the pencil line from one edge toward the other, the
 * offcut sags open a sliver over the last strokes, and every stroke
 * spills sawdust where the blade crosses. The last fibers let go at a
 * full mask, and that's `finishAttendedWork`.
 */

/** How far along the line the hand must travel to count as a stroke. */
const MIN_TRAVEL_IN = 0.05;

/** How far off the line the saw still bites, in inches. */
const LINE_REACH_IN = 1.5;

const PENCIL = 0x4a4237;
const KERF = 0x2b241c;

interface SawCut {
  readonly pieceId: string;
  readonly mask: KerfMask;
  /** Where the blade last was along the board's width, in inches —
   * null between strokes (the hand off the line). */
  last: number | null;
}

export class BenchSawView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private root: Container & GameSprite;
  /** The claimed board, drawn as two halves seamed under the line. */
  private halves = new Container();
  private lines = new Graphics();
  private dust = new KerfDust();
  private cut: SawCut | null = null;
  /** The saw's synthesized voice, built on the first stroke so a bench
   * that only ever shows a pencil line stays silent and graphless. */
  private voice: HandSawVoice | null = null;
  /** Seconds since the last stroke, for the voice's stroke speed. */
  private sinceStroke = 0;
  /** Sawdust doesn't wait for the board to part: the kerf sheds onto the
   * shop floor a couple of times a second while the blade is moving —
   * the sim's ledger, where `dust` above is the spill you watch fly. */
  private floorDust = new BenchDustThrottle();
  /** The board the halves were built for, so they're rebuilt only when
   * a different piece comes under the saw. */
  private drawnPieceId: string | null = null;
  private kept: BoardHalf | null = null;
  private offcut: BoardHalf | null = null;

  /** How deep the cut in progress is, 0..1 (null when no line is being
   * sawn) — the same seam `strokeProgress` gives the sander. */
  kerfProgress(): number | null {
    return this.cut ? kerfFraction(this.cut.mask) : null;
  }

  constructor() {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "hud";
    this.root.addChild(this.halves, this.lines);
    this.sprite = this.root;
  }

  onAdd() {
    // Draw into the dive's own frame, so the lean-in carries every
    // surface on the stage as one picture.
    this.game.entities.getSingleton(BenchDiveView).frame.addChild(this.root);
  }

  private dive(): BenchDive | undefined {
    return this.game.entities.tryGetSingleton(BenchDive);
  }

  /** The pointer in bench-frame inches, or null with no stage. */
  private pointerInches(): { xIn: number; yIn: number } | null {
    const stage = benchStage(this.game);
    return stage ? stagePointer(this.game, stage.fit) : null;
  }

  /** The cut running on this bench right now, if any. */
  private sawScript(): { machine: Machine; script: SawScript } | null {
    const work = benchWork(this.game);
    return work?.script.kind === "saw"
      ? { machine: work.machine, script: work.script }
      : null;
  }

  /** The saw job this held tool offers on that piece, or null. */
  private sawOffer(piece: GroupPiece): Operation | null {
    const dive = this.dive();
    const opened = openBenchGroup(this.game)?.opened;
    if (!dive?.heldTool || !opened) return null;
    const operation = toolOperationFor(
      opened,
      projectProgression(this.game),
      dive.heldTool,
      piece.material,
      piece.placement,
    );
    return operation?.interaction?.kind === "saw" ? operation : null;
  }

  /** The angle stop the miter box is set to, in degrees. */
  private angle(): number {
    const opened = openBenchGroup(this.game)?.opened;
    return Number(opened?.state.selectedParameters?.angle ?? 0);
  }

  /** The board the saw is hovering, pre-mark, and the detent it would
   * mark — the pencil line waiting for the press. */
  private ghostMark(): {
    piece: GroupPiece;
    spot: PieceSpot;
    markIn: number;
  } | null {
    if (this.sawScript()) return null;
    const at = this.pointerInches();
    const group = openBenchGroup(this.game)?.group;
    if (!at || !group) return null;
    const piece = pieceUnder(group, at.xIn, at.yIn);
    if (!piece || piece.material.type !== "board") return null;
    if (!this.sawOffer(piece)) return null;
    const size = placedPieceSize(piece.material, piece.placement);
    const local = benchPointInFrame(piece.placement, size, at.xIn, at.yIn);
    const markIn = nearestSawMark(piece.material, local.yIn);
    if (markIn === null) return null;
    return {
      piece,
      spot: { id: piece.material.id, placement: piece.placement, size },
      markIn,
    };
  }

  /** Where the marked board lies, in the run's frame. */
  private workpieceSpot(machine: Machine, script: SawScript): PieceSpot | null {
    const group = openBenchGroup(this.game)?.group;
    return group ? workpieceSpot(group, machine, script.workpiece) : null;
  }

  /**
   * The press marks the cut: the detent under the hand becomes the
   * line, and starting the operation with those parameters is what
   * claims the board.
   */
  @on("mouseDown")
  onMouseDown() {
    const dive = this.dive();
    const bench = dive?.openBench();
    if (!dive || !bench || !dive.settled()) return;
    const ghost = this.ghostMark();
    if (!ghost) return;
    const operation = this.sawOffer(ghost.piece);
    if (!operation) return;
    // The board may be lying on the next table over; the saw and the
    // operation are this bench's, so slide it across first.
    if (
      machineKey(ghost.piece.member.machine.state) !== machineKey(bench.state)
    ) {
      gatherBenchPieces(this.game, bench, [ghost.piece.material.id]);
    }
    operateMachine(this.game, bench, {
      operationId: operation.id,
      materialId: ghost.piece.material.id,
      parameters: sawMarkParameters(ghost.markIn, this.angle()),
    });
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /**
   * R swings the miter box's angle stop, the ghost line following it.
   * It locks once a cut is marked, like any machine setting mid-job.
   */
  @on("keyDown")
  onKeyDown({ key, event }: GameEventMap["keyDown"]) {
    if (key !== "KeyR") return;
    const dive = this.dive();
    const bench = dive?.openBench();
    if (!dive?.heldTool || !bench || !dive.settled()) return;
    if (bench.state.operationProgress.status === "inProgress") return;
    if (!this.sawInHand()) return;
    const current = this.angle();
    const index = SAW_ANGLE_STOPS.findIndex((stop) => stop === current);
    const next =
      SAW_ANGLE_STOPS[(index + 1) % SAW_ANGLE_STOPS.length] ??
      SAW_ANGLE_STOPS[0];
    setMachineSettings(this.game, bench, { angle: next });
    event.preventDefault();
    event.stopImmediatePropagation();
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /** Whether the tool in hand is one that saws. */
  private sawInHand(): boolean {
    const held = this.dive()?.heldTool;
    if (!held) return false;
    return TOOL_TYPES[held].operations.some(
      (operation) => operation.interaction?.kind === "saw",
    );
  }

  @on("tick")
  onTick(dt: number) {
    this.sinceStroke += dt;
    this.floorDust.step(dt);
    this.voice?.tick(dt);
    const bench = stageSettled(this.game) ? this.dive()?.openBench() : null;
    const running = bench ? this.sawScript() : null;
    const spot =
      running?.script.started && bench
        ? this.workpieceSpot(running.machine, running.script)
        : null;
    if (!running || !bench || !spot) {
      this.cut = null;
      this.dust.tick(dt, null);
      this.hushVoice();
      return;
    }
    const board = running.script.workpiece;
    // A new board under the saw starts a fresh kerf; the mask lives as
    // long as the player stays leaned over the bench (decision 3).
    if (this.cut?.pieceId !== spot.id) {
      const cross = sawCrossSection(board);
      this.cut = {
        pieceId: spot.id,
        mask: makeKerfMask(cross.widthIn, cross.thicknessIn),
        last: null,
      };
      this.dust.clear();
    }
    this.dust.tick(dt, spot);

    const at = this.pointerInches();
    if (!this.game.io.lmb || !at || !this.sawInHand()) {
      this.cut.last = null;
      return;
    }
    const line = this.markedLine(running.machine, running.script, spot);
    const local = benchPointInFrame(spot.placement, spot.size, at.xIn, at.yIn);
    // The saw only bites within a hand's width of the marked line.
    const onLine =
      local.xIn >= -0.5 &&
      local.xIn <= spot.size.widthIn + 0.5 &&
      Math.abs(local.yIn - lineY(local.xIn, line.centerIn, line.angle, spot)) <=
        LINE_REACH_IN;
    if (!onLine) {
      this.cut.last = null;
      return;
    }
    const last = this.cut.last;
    this.cut.last = local.xIn;
    if (last === null) return;
    const travel = Math.abs(local.xIn - last);
    if (travel < MIN_TRAVEL_IN) return;
    sawStroke(this.cut.mask, travel, running.script.interaction.kerfPerSecond);
    // The floor gets its share while the cut is still open.
    if (this.floorDust.due()) emitBenchDust(this.game, bench);

    // Dust spills at the crossing point, kicked the way the saw moves.
    const run = Math.tan((line.angle * Math.PI) / 180);
    const norm = Math.hypot(1, run);
    const direction = Math.sign(local.xIn - last) || 1;
    // The voice hears every stroke: speed from how long this one took,
    // direction for the push–pull asymmetry, depth for the timbre arc.
    const seconds = Math.min(0.1, Math.max(0.004, this.sinceStroke));
    this.sinceStroke = 0;
    this.voice ??= new HandSawVoice();
    this.voice.stroke(
      travel / seconds,
      direction > 0 ? 1 : -1,
      kerfFraction(this.cut.mask),
    );
    this.dust.spill({
      xIn: local.xIn,
      yIn: lineY(local.xIn, line.centerIn, line.angle, spot),
      dirX: direction / norm,
      dirY: (direction * run) / norm,
      travelIn: travel,
      species: materialDustSpecies(board)[0] ?? "pine",
    });

    if (kerfComplete(this.cut.mask)) {
      // The last fibers let go: the crack plays detached from the voice,
      // which is about to be disposed. handSawCut is explicitly silent
      // in the clip table so no generic whack lands on top of it.
      playSawPartCrack();
      this.hushVoice();
      finishAttendedWork(this.game, bench);
      this.cut = null;
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
    }
  }

  /** Put the saw's voice away until the next cut. */
  private hushVoice(): void {
    this.voice?.dispose();
    this.voice = null;
  }

  /** The cut the board was marked with: where the line crosses it and
   * how far the angle stop slants it. */
  private markedLine(
    machine: Machine,
    script: SawScript,
    spot: PieceSpot,
  ): { centerIn: number; angle: number } {
    const params = machine.resolvedParameters(script.operation);
    return {
      centerIn: sawLineFraction(script.workpiece, params) * spot.size.heightIn,
      angle: Number(params.angle ?? 0),
    };
  }

  @on("render")
  onRender() {
    const g = this.lines;
    g.clear();
    const stage = benchStage(this.game);
    const running = stage ? this.sawScript() : null;
    const spot =
      running?.script.started && stage
        ? this.workpieceSpot(running.machine, running.script)
        : null;

    if (!stage || !running || !spot) {
      this.clearHalves();
      // Pre-mark: the pencil line trailing the hand at its detent.
      const ghost = stage ? this.ghostMark() : null;
      if (!stage || !ghost) return;
      this.drawLine(g, stage.fit, ghost.spot, ghost.markIn, this.angle(), 0);
      return;
    }

    // The claimed board draws here now — the dive's pile no longer has
    // it — as two halves seamed under the kerf, so the offcut can hang
    // open a sliver over the last strokes.
    const line = this.markedLine(running.machine, running.script, spot);
    const fraction = this.cut ? kerfFraction(this.cut.mask) : 0;
    this.drawHalves(stage.fit, spot, running.script.workpiece, line, fraction);
    this.drawLine(g, stage.fit, spot, line.centerIn, line.angle, fraction);
    this.dust.draw(g, stage.fit, spot);
  }

  /** Put the board away: it parted, or nobody is sawing. */
  private clearHalves(): void {
    if (this.drawnPieceId === null) return;
    this.halves.removeChildren().forEach((child) => child.destroy());
    this.kept = null;
    this.offcut = null;
    this.drawnPieceId = null;
  }

  /**
   * The board under the saw, in two halves. Each half is the whole
   * board's sprite behind a mask of everything on one side of the
   * marked line, so the seam is the line itself; the offcut's mask
   * rides with it as it sags.
   */
  private drawHalves(
    fit: StageFit,
    spot: PieceSpot,
    board: Board,
    line: { centerIn: number; angle: number },
    fraction: number,
  ): void {
    if (this.drawnPieceId !== spot.id) {
      this.clearHalves();
      this.kept = buildHalf(board, spot, fit);
      this.offcut = buildHalf(board, spot, fit);
      this.halves.addChild(this.kept.holder, this.offcut.holder);
      this.drawnPieceId = spot.id;
    }
    const kept = this.kept;
    const offcut = this.offcut;
    if (!kept || !offcut) return;

    for (const half of [kept, offcut]) {
      half.holder.position.set(
        fit.originX + spot.placement.xIn * fit.pxPerIn,
        fit.originY + spot.placement.yIn * fit.pxPerIn,
      );
      half.holder.angle = spot.placement.angleDeg;
      half.holder.scale.x = spot.placement.flipped ? -1 : 1;
    }

    // The line in the board's own centered pixels — the frame both
    // masks are cut in.
    const ends = lineEnds(spot, line.centerIn, line.angle);
    const local = (point: { xIn: number; yIn: number }): [number, number] => [
      (point.xIn - spot.size.widthIn / 2) * fit.pxPerIn,
      (point.yIn - spot.size.heightIn / 2) * fit.pxPerIn,
    ];
    const [x0, y0] = local(ends.a);
    const [x1, y1] = local(ends.b);
    drawHalfMask(kept.mask, "kept", spot, fit, [x0, y0, x1, y1]);
    drawHalfMask(offcut.mask, "offcut", spot, fit, [x0, y0, x1, y1]);

    // Nothing until the last strokes, then the offcut hangs open: the
    // angle is sized so the kerf's free end gapes about a fifth of an
    // inch by the final stroke, whatever the board's width — a fixed
    // angle would vanish on narrow stock. The fibers still holding are
    // at the uncut end, so the swing pivots there.
    const t = Math.min(1, Math.max(0, (fraction - 0.85) / 0.15));
    const lengthPx = Math.hypot(x1 - x0, y1 - y0);
    const gapPx = 0.22 * fit.pxPerIn;
    offcut.sag.pivot.set(x1, y1);
    offcut.sag.position.set(x1, y1);
    offcut.sag.rotation = -t * t * Math.min(0.07, gapPx / lengthPx);
  }

  /**
   * One line on the board: pencil ahead of the blade, kerf behind it.
   * The kerf is a jittered polyline — deterministic per vertex, so
   * redraws don't shimmer — drawn twice, the torn mouth wide and soft
   * and the through-cut thin and dark.
   */
  private drawLine(
    g: Graphics,
    fit: StageFit,
    spot: PieceSpot,
    centerIn: number,
    angle: number,
    fraction: number,
  ) {
    const ends = lineEnds(spot, centerIn, angle);
    const [x0, y0] = toStage(fit, spot.placement, spot.size, ends.a);
    const [x1, y1] = toStage(fit, spot.placement, spot.size, ends.b);
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (fraction < 1) {
      g.moveTo(x0 + dx * fraction, y0 + dy * fraction)
        .lineTo(x1, y1)
        .stroke({ width: 2, color: PENCIL, alpha: 0.7 });
    }
    if (fraction <= 0) return;
    const length = Math.hypot(dx, dy);
    const px = -dy / length;
    const py = dx / length;
    const steps = Math.max(2, Math.round((length * fraction) / 5));
    const kerfPath = (upTo: number) => {
      g.moveTo(x0, y0);
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * upTo;
        const w = i === steps ? 0 : wander(i) * 0.8;
        g.lineTo(x0 + dx * t + px * w, y0 + dy * t + py * w);
      }
    };
    if (fraction > 0.12) {
      kerfPath(fraction * 0.88);
      g.stroke({ width: 3.4, color: KERF, alpha: 0.5 });
    }
    kerfPath(fraction);
    g.stroke({ width: 1.8, color: KERF, alpha: 0.95 });
  }
}

/**
 * One side of the cut: the whole board's sprite behind a mask, in a
 * container that can swing about the fibers still holding.
 *
 *   holder — placed and turned like any piece on the stage
 *     sag  — the swing as the cut nears through (identity on the kept
 *            side), in the board's own centered pixels
 *       sprite + mask
 */
interface BoardHalf {
  holder: Container;
  sag: Container;
  mask: Graphics;
}

function buildHalf(board: Board, spot: PieceSpot, fit: StageFit): BoardHalf {
  const holder = new Container();
  const sag = new Container();
  const inner = new Container();
  const sprite = createMaterialSprite(board, {
    onEdge: spot.placement.onEdge,
    onEnd: spot.placement.onEnd,
  });
  inner.scale.set(fit.spriteScale);
  inner.addChild(sprite);
  const mask = new Graphics();
  sag.addChild(inner, mask);
  sag.mask = mask;
  holder.addChild(sag);
  return { holder, sag, mask };
}

/**
 * Everything to one side of the marked line, with margin so the
 * sprite's full extent stays covered. The mask is a child of the half
 * it clips, so the offcut's mask sags with it.
 */
function drawHalfMask(
  g: Graphics,
  side: "kept" | "offcut",
  spot: PieceSpot,
  fit: StageFit,
  [x0, y0, x1, y1]: [number, number, number, number],
): void {
  g.clear();
  const margin = 6;
  const xL = x0 - margin;
  const xR = x1 + margin;
  const slope = (y1 - y0) / (x1 - x0);
  const yL = y0 - slope * margin;
  const yR = y1 + slope * margin;
  const edge =
    side === "kept"
      ? -(spot.size.heightIn * fit.pxPerIn) / 2 - margin
      : (spot.size.heightIn * fit.pxPerIn) / 2 + margin;
  g.poly([xL, yL, xR, yR, xR, edge, xL, edge]).fill(0xffffff);
}

/** The line's y at a local x, in the board's own inches — the angle
 * stop slants it about the board's middle. */
function lineY(
  xIn: number,
  centerIn: number,
  angle: number,
  spot: PieceSpot,
): number {
  return (
    centerIn + (xIn - spot.size.widthIn / 2) * Math.tan((angle * Math.PI) / 180)
  );
}

/** The marked line's two ends, in the board's own inches. */
function lineEnds(
  spot: PieceSpot,
  centerIn: number,
  angle: number,
): { a: { xIn: number; yIn: number }; b: { xIn: number; yIn: number } } {
  return {
    a: { xIn: 0, yIn: lineY(0, centerIn, angle, spot) },
    b: {
      xIn: spot.size.widthIn,
      yIn: lineY(spot.size.widthIn, centerIn, angle, spot),
    },
  };
}

/** A point in the board's own inches, on the stage in screen px. */
function toStage(
  fit: StageFit,
  placement: BenchPlacement,
  size: { widthIn: number; heightIn: number },
  point: { xIn: number; yIn: number },
): [number, number] {
  const at = framePointOnBench(placement, size, point.xIn, point.yIn);
  return [
    fit.originX + at.xIn * fit.pxPerIn,
    fit.originY + at.yIn * fit.pxPerIn,
  ];
}

/** The ragged wander of a hand-cut kerf, deterministic per vertex. */
function wander(index: number): number {
  const s = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
