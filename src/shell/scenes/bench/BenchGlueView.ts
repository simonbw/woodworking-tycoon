import { Graphics } from "pixi.js";
import { StageFit } from "./stageMath";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { groupPieces } from "../../../game/bench-work/bench-group";
import {
  CoverageGrid,
  coverageFraction,
  makeCoverageGrid,
  stampStroke,
} from "../../../game/bench-work/coverage";
import {
  BEAD_RADIUS_IN,
  ClampPlacement,
  clampGhosts,
  clampsForGlueSpan,
  clampsOnRun,
  CLAMP_HIT_IN,
  CLAMP_SNAP_IN,
  detectGlueRun,
  GlueRun,
  SPREAD_COMPLETE,
  SPREAD_PER_SECOND,
} from "../../../game/bench-work/glue-up";
import { clampsFree } from "../../../game/Clamp";
import { availableOperations } from "../../../game/skill-helpers";
import { finishAttendedWork } from "../../../sim/commands/machine-commands";
import {
  gatherBenchPieces,
  startGlueUp,
} from "../../../sim/commands/bench-commands";
import { projectGameState } from "../../../sim/projection";
import { playSound } from "../../../utils/sfx";
import { ShellStore } from "../../ShellStore";
import { BenchDive } from "./BenchDive";
import { BenchDiveView } from "./BenchDiveView";
import { benchStage, openBenchGroup, stagePointer } from "./benchStage";

/**
 * Clamps-first glue-ups (migration phase 7, docs/bench-work.md decision
 * 0): no plan is ever pulled. The player sets bar clamps out on the
 * bench, lays stock across them edge to edge, runs a bead down each open
 * seam with the bottle, and winds the clamps tight — and whatever
 * contiguous run of glueable stock sits in the clamps IS the glue-up,
 * the way the stock on a direct-feed machine decides the cut. The
 * inference is all in the pure `glue-up.ts`; this view is the hands.
 *
 * Everything here is ephemeral (decision 3): the bars set out, the beads
 * spread, and the count wound tight live only while the player is leaned
 * over the bench. The single commit fires when the last clamp comes
 * tight — pieces gathered onto one table, the operation claimed, and the
 * attended phase resolved, so the cure begins right there.
 */

const CLAMP_BAR = 0xb3502d;
const CLAMP_JAW = 0x57504a;
const CLAMP_SCREW = 0x2f2b28;
const SEAM_DRY = 0xf5efe3;
const SEAM_WET = 0xe8b84a;

/** The bar overhangs the stock this much at each end — the jaws. */
const BAR_OVERHANG_IN = 3;

/** A free clamp's bar before any run tells it what to span. */
const DEFAULT_BAR_IN = 24;

export class BenchGlueView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private layer: Graphics & GameSprite;
  /** Bars set out on the bench, in the run's frame. */
  private clamps: ClampPlacement[] = [];
  /** How many of those are wound tight (the first N, in order). */
  private tightened = 0;
  /** Bead coverage per seam, keyed by the seam's stable key. */
  private beads = new Map<string, CoverageGrid>();
  /** The run those beads belong to, so a different run starts fresh. */
  private beadRunKey = "";
  /** Where the bottle last was along the seam it's riding. */
  private lastBead: { key: string; tIn: number } | null = null;
  /** Seconds since the last bead landed — how long this stroke took. */
  private sinceBead = 0;

  constructor() {
    super();
    this.layer = new Graphics() as Graphics & GameSprite;
  }

  /** How the glue-up stands right now — the seam the specs watch. */
  glueProgress(): {
    /** How many pieces the run lays up, and what it amounts to. */
    pieces: number;
    operationId: string;
    clamps: number;
    needed: number;
    seamsGlued: number;
    seams: number;
    /** How wet the least-covered seam is, 0..1. */
    beadCoverage: number;
    tightened: number;
  } | null {
    const run = this.run();
    if (!run) return null;
    return {
      pieces: run.pieces.length,
      operationId: run.operationId,
      clamps: clampsOnRun(run, this.clamps).length,
      needed: clampsForGlueSpan(run.lengthIn),
      seamsGlued: this.seamsGlued(run),
      seams: run.seams.length,
      beadCoverage: Math.min(
        ...run.seams.map((seam) =>
          coverageFraction(this.beads.get(seam.key) ?? empty()),
        ),
        1,
      ),
      tightened: this.tightened,
    };
  }

  /**
   * Where the glue-up's ironmongery sits on screen — the same seam
   * `nailPoints` gives the hammer: a spec aims a bar at a real ghost
   * and runs the bottle down a real seam.
   */
  gluePoints(): {
    ghosts: Array<{ x: number; y: number }>;
    clamps: Array<{ x: number; y: number }>;
    seams: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  } | null {
    const stage = benchStage(this.game);
    const run = this.run();
    if (!stage || !run) return null;
    const at = (xIn: number, yIn: number) => ({
      x: stage.fit.originX + xIn * stage.fit.pxPerIn,
      y: stage.fit.originY + yIn * stage.fit.pxPerIn,
    });
    return {
      ghosts: this.ghosts(run).map((ghost) => at(ghost.xIn, ghost.yIn)),
      clamps: this.clamps.map((clamp) => at(clamp.xIn, clamp.yIn)),
      seams: run.seams.map((seam) => {
        const a = at(seam.x0In, seam.y0In);
        const b = at(seam.x1In, seam.y1In);
        return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      }),
    };
  }

  /** How many bars are set out on the bench, run or no run. */
  clampsSetOut(): number {
    return this.clamps.length;
  }

  /** Why the stock lying there isn't a glue-up yet, in the pure
   * engine's own words — or null when it is one (or when nothing about
   * a glue-up applies here). */
  glueRefusal(): string | null {
    if (!this.glueContext() || this.run()) return null;
    return detectGlueRun(
      this.pieces().map((piece) => ({
        material: piece.material,
        placement: piece.placement,
      })),
    ).reason;
  }

  onAdd() {
    // Draw into the dive's own frame, so the lean-in carries every
    // surface on the stage as one picture.
    this.game.entities.getSingleton(BenchDiveView).frame.addChild(this.layer);
  }

  private dive(): BenchDive | undefined {
    return this.game.entities.tryGetSingleton(BenchDive);
  }

  /**
   * Whether the bench is in the glue-up's world at all: a bench with a
   * glue recipe known, nothing already running, and no pallet lying
   * across it (a pallet covers the top; prying it off comes first).
   */
  private glueContext(): boolean {
    const dive = this.dive();
    const opened = openBenchGroup(this.game)?.opened;
    if (!dive || dive.openBenchKey === null || !opened) return false;
    if (opened.operationProgress.status === "inProgress") return false;
    const progression = projectGameState(this.game).progression;
    const knowsGlue = availableOperations(opened, progression).some(
      (operation) => operation.interaction?.kind === "glue",
    );
    if (!knowsGlue) return false;
    return !this.pieces().some((piece) => piece.material.type === "pallet");
  }

  private pieces() {
    const group = openBenchGroup(this.game)?.group;
    return group ? groupPieces(group) : [];
  }

  /** The run lying in the clamps right now, or null. */
  private run(): GlueRun | null {
    if (!this.glueContext()) return null;
    const opened = openBenchGroup(this.game)?.opened;
    if (!opened) return null;
    const detected = detectGlueRun(
      this.pieces().map((piece) => ({
        material: piece.material,
        placement: piece.placement,
      })),
    );
    if (!detected.run) return null;
    // A composition whose recipe isn't known yet simply never forms a
    // run — no grayed-out tease.
    const known = availableOperations(
      opened,
      projectGameState(this.game).progression,
    ).some((operation) => operation.id === detected.run!.operationId);
    return known ? detected.run : null;
  }

  /** Free bars on the rack, minus the ones already set out. */
  private clampsAvailable(): number {
    const gs = projectGameState(this.game);
    return Math.max(0, clampsFree(gs.clamps, gs.machines) - this.clamps.length);
  }

  private seamsGlued(run: GlueRun): number {
    return run.seams.filter(
      (seam) =>
        coverageFraction(this.beads.get(seam.key) ?? empty()) >=
        SPREAD_COMPLETE,
    ).length;
  }

  /** Whether the last clamp would start the cure. */
  private ready(run: GlueRun): boolean {
    return (
      clampsOnRun(run, this.clamps).length >= clampsForGlueSpan(run.lengthIn) &&
      this.seamsGlued(run) === run.seams.length
    );
  }

  /** Ghost bars where the run still wants a clamp. */
  private ghosts(run: GlueRun): ReadonlyArray<ClampPlacement> {
    return clampGhosts(run).filter(
      (ghost) =>
        !this.clamps.some(
          (clamp) =>
            Math.hypot(clamp.xIn - ghost.xIn, clamp.yIn - ghost.yIn) <=
            CLAMP_SNAP_IN,
        ),
    );
  }

  /** Where a held bar would land: the nearest open ghost, or free. */
  private snapClamp(
    run: GlueRun | null,
    xIn: number,
    yIn: number,
  ): ClampPlacement {
    const ghosts = run ? this.ghosts(run) : [];
    let best: ClampPlacement | null = null;
    let bestDistance = CLAMP_SNAP_IN;
    for (const ghost of ghosts) {
      const distance = Math.hypot(ghost.xIn - xIn, ghost.yIn - yIn);
      if (distance <= bestDistance) {
        best = ghost;
        bestDistance = distance;
      }
    }
    return best ?? { xIn, yIn, angleDeg: run?.angleDeg ?? 0 };
  }

  /** The set-out bar whose length is under the hand, if any. */
  private clampUnder(
    run: GlueRun | null,
    xIn: number,
    yIn: number,
  ): number | null {
    const halfBar = run ? run.spanIn / 2 + BAR_OVERHANG_IN : DEFAULT_BAR_IN / 2;
    let bestIndex: number | null = null;
    let bestDistance = CLAMP_HIT_IN;
    this.clamps.forEach((clamp, index) => {
      const radians = (clamp.angleDeg * Math.PI) / 180;
      const dirX = Math.cos(radians);
      const dirY = Math.sin(radians);
      const along = Math.max(
        -halfBar,
        Math.min(halfBar, (xIn - clamp.xIn) * dirX + (yIn - clamp.yIn) * dirY),
      );
      const distance = Math.hypot(
        xIn - (clamp.xIn + dirX * along),
        yIn - (clamp.yIn + dirY * along),
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  /** One drag of the bottle: the bead lands on the seam it's riding. */
  private spread(run: GlueRun, xIn: number, yIn: number): void {
    let best: GlueRun["seams"][number] | null = null;
    let bestT = 0;
    let bestDistance = BEAD_RADIUS_IN * 1.5;
    for (const seam of run.seams) {
      const vx = (seam.x1In - seam.x0In) / seam.lengthIn;
      const vy = (seam.y1In - seam.y0In) / seam.lengthIn;
      const t = Math.max(
        0,
        Math.min(
          seam.lengthIn,
          (xIn - seam.x0In) * vx + (yIn - seam.y0In) * vy,
        ),
      );
      const distance = Math.hypot(
        xIn - (seam.x0In + vx * t),
        yIn - (seam.y0In + vy * t),
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = seam;
        bestT = t;
      }
    }
    if (!best) {
      this.lastBead = null;
      return;
    }
    let grid = this.beads.get(best.key);
    if (!grid) {
      grid = makeCoverageGrid(1, best.lengthIn);
      this.beads.set(best.key, grid);
    }
    const last = this.lastBead;
    this.lastBead = { key: best.key, tIn: bestT };
    if (!last || last.key !== best.key) {
      this.sinceBead = 0;
      return;
    }
    const travel = Math.abs(bestT - last.tIn);
    if (travel < 0.05) return;
    // The same pacing the old bottle had: glue goes down per second of
    // spreading, thinned over how fast the hand runs. The time counted
    // is the time since the last bead landed, capped — a hand that
    // pauses mid-seam doesn't pour a puddle when it starts again.
    const seconds = Math.min(this.sinceBead, 0.1);
    this.sinceBead = 0;
    const gain = Math.min(
      1,
      (SPREAD_PER_SECOND * seconds) / Math.max(travel, 0.1),
    );
    stampStroke(grid, 0.5, last.tIn, 0.5, bestT, BEAD_RADIUS_IN, gain / 4);
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  @on("tick")
  onTick(dt: number) {
    const dive = this.dive();
    const stage = benchStage(this.game);
    if (!dive || !stage || !dive.settled() || !this.glueContext()) {
      this.clearBench();
      return;
    }
    const run = this.run();
    // A different run is a different glue-up: fresh beads, nothing tight.
    const runKey = run ? run.pieces.map((piece) => piece.id).join("|") : "";
    if (runKey !== this.beadRunKey) {
      this.beads.clear();
      this.beadRunKey = runKey;
      this.lastBead = null;
      this.tightened = 0;
    }
    if (run && this.tightened > 0 && !this.ready(run)) {
      this.tightened = 0;
    }

    const at = stagePointer(this.game, stage.fit);
    if (dive.holdingGlue) {
      this.sinceBead += dt;
      if (this.game.io.lmb && run) {
        this.spread(run, at.xIn, at.yIn);
      } else {
        this.lastBead = null;
        this.sinceBead = 0;
      }
    }
  }

  /**
   * The press does whatever the hand is holding: lays a bar down,
   * or — bare-handed on a bar of a run that's ready — winds it tight.
   * The last one tight is the commit.
   */
  @on("mouseDown")
  onMouseDown() {
    const dive = this.dive();
    const stage = benchStage(this.game);
    if (!dive || !stage || !dive.settled() || !this.glueContext()) return;
    const at = stagePointer(this.game, stage.fit);
    const run = this.run();

    if (dive.holdingClamp) {
      if (this.clampsAvailable() <= 0) return;
      this.clamps.push(this.snapClamp(run, at.xIn, at.yIn));
      // The last free bar leaves the hand empty.
      if (this.clampsAvailable() <= 0) dive.setHolding(null);
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
      return;
    }
    if (dive.holdingGlue || dive.heldTool) return;

    const index = this.clampUnder(run, at.xIn, at.yIn);
    if (index === null) return;
    if (run && this.ready(run)) {
      const next = this.tightened + 1;
      const onRun = clampsOnRun(run, this.clamps).length;
      if (next >= onRun) {
        this.commit(run);
        return;
      }
      playSound("glue-clamp", 0.5);
      this.tightened = next;
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
      return;
    }
    // Not ready: the press picks the bar back up.
    this.clamps.splice(index, 1);
    dive.setHolding("clamp");
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /**
   * The tighten is the single commit (decision 4's middle): the run's
   * pieces come onto one table, the operation claims them, and the
   * attended phase resolves — the hand work was it — so the cure starts
   * here on the bench.
   */
  private commit(run: GlueRun): void {
    const bench = this.dive()?.openBench();
    if (!bench) return;
    const ids = run.pieces.map((piece) => piece.id);
    gatherBenchPieces(this.game, bench, ids);
    playSound("glue-clamp", 0.5);
    if (startGlueUp(this.game, bench, ids)) {
      finishAttendedWork(this.game, bench);
    }
    this.clearBench();
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /** Put the bars and the bottle away and forget the beads. */
  private clearBench(): void {
    const dive = this.dive();
    if (dive && (dive.holdingClamp || dive.holdingGlue)) dive.setHolding(null);
    if (this.clamps.length === 0 && this.beads.size === 0) return;
    this.clamps = [];
    this.tightened = 0;
    this.beads.clear();
    this.beadRunKey = "";
    this.lastBead = null;
  }

  @on("render")
  onRender() {
    const g = this.layer;
    g.clear();
    const dive = this.dive();
    const stage = benchStage(this.game);
    if (!dive || !stage || !this.glueContext()) return;
    const run = this.run();
    const fit = stage.fit;

    // Seams first, under the ironmongery: each fills as its bead goes
    // down, and turns glue-colored once it's covered.
    if (run) {
      for (const seam of run.seams) {
        const covered = Math.min(
          coverageFraction(this.beads.get(seam.key) ?? empty()),
          1,
        );
        g.moveTo(
          fit.originX + seam.x0In * fit.pxPerIn,
          fit.originY + seam.y0In * fit.pxPerIn,
        )
          .lineTo(
            fit.originX + seam.x1In * fit.pxPerIn,
            fit.originY + seam.y1In * fit.pxPerIn,
          )
          .stroke({
            width: 4,
            color: covered >= SPREAD_COMPLETE ? SEAM_WET : SEAM_DRY,
            alpha: 0.2 + covered * 0.7,
          });
      }
    }

    const halfBar = run ? run.spanIn / 2 + BAR_OVERHANG_IN : DEFAULT_BAR_IN / 2;
    if (run) {
      for (const ghost of this.ghosts(run)) {
        drawClamp(g, ghost, fit, halfBar, "ghost");
      }
    }
    this.clamps.forEach((clamp, index) => {
      drawClamp(
        g,
        clamp,
        fit,
        halfBar,
        index < this.tightened ? "tightened" : "placed",
      );
    });
    if (dive.holdingClamp) {
      const at = stagePointer(this.game, stage.fit);
      drawClamp(g, this.snapClamp(run, at.xIn, at.yIn), fit, halfBar, "held");
    }
  }
}

/** An empty grid, for a seam nobody has touched yet. */
function empty(): CoverageGrid {
  return makeCoverageGrid(1, 1);
}

/** One bar clamp on the stage: the bar across the run, jaws at its ends,
 * and the screw handle wound home once it's tight. */
function drawClamp(
  g: Graphics,
  clamp: ClampPlacement,
  fit: StageFit,
  halfBarIn: number,
  style: "ghost" | "placed" | "tightened" | "held",
): void {
  const radians = (clamp.angleDeg * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const cx = fit.originX + clamp.xIn * fit.pxPerIn;
  const cy = fit.originY + clamp.yIn * fit.pxPerIn;
  const half = halfBarIn * fit.pxPerIn;
  const x0 = cx - dirX * half;
  const y0 = cy - dirY * half;
  const x1 = cx + dirX * half;
  const y1 = cy + dirY * half;
  if (style === "ghost") {
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: 3, color: SEAM_DRY, alpha: 0.3 });
    return;
  }
  const alpha = style === "held" ? 0.55 : 0.95;
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 5, color: CLAMP_BAR, alpha });
  const jawX = -dirY * 0.9 * fit.pxPerIn;
  const jawY = dirX * 0.9 * fit.pxPerIn;
  for (const [ex, ey] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    g.moveTo(ex - jawX, ey - jawY)
      .lineTo(ex + jawX, ey + jawY)
      .stroke({ width: 8, color: CLAMP_JAW, alpha });
  }
  if (style === "tightened") {
    g.circle(cx, cy, 4).fill({ color: CLAMP_SCREW, alpha: 0.9 });
  }
}
