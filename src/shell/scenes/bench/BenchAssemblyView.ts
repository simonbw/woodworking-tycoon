import { Graphics } from "pixi.js";
import { StageFit } from "../../../components/bench-view/stageMath";
import { drawFastenerHead } from "../../../components/material-sprites/fastenerHead";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import {
  armedFasteners,
  assemblyFramePlacement,
  fastenerAt,
  fastenerOnBench,
  fastenedPieceIds,
  seatedParts,
  slotOnBench,
  snapPlacementFor,
} from "../../../game/bench-work/assembly";
import { groupPieces } from "../../../game/bench-work/bench-group";
import {
  BenchPlacement,
  benchTopSizeIn,
} from "../../../game/bench-work/bench-layout";
import {
  BlueprintFastener,
  fastenerToolId,
  ProductBlueprint,
  productBlueprintFor,
  slotFootprintIn,
} from "../../../game/bench-work/blueprint";
import { selectedBenchPlan } from "../../../game/bench-work/tool-work";
import { ConsumableId } from "../../../game/Consumable";
import { MaterialInstance } from "../../../game/Materials";
import { ToolId } from "../../../game/Tool";
import { gatherBenchPieces } from "../../../sim/commands/bench-commands";
import {
  finishAttendedWork,
  operateMachine,
} from "../../../sim/commands/machine-commands";
import { playSound } from "../../../utils/sfx";
import { ShellStore } from "../../ShellStore";
import { BenchArrangeView } from "./BenchArrangeView";
import { BenchDive } from "./BenchDive";
import { benchStage, openBenchGroup, stagePointer } from "./benchStage";

/**
 * Blueprint assembly on the bench itself (migration phase 7, the last
 * of the four modes): the drawing pulled off the pile puts ghost
 * outlines on the bench top, the player lays each part on its outline —
 * a drag released near one settles onto it — and the crossings where two
 * seated parts meet arm for the fastener the drawing names. Driving the
 * last one commits the whole build.
 *
 * Seating is never stored: it's read back out of where the pieces lie
 * (`seatedParts` over the bench's own layout), so standing up and
 * coming back finds every part exactly as seated as it was left. Only
 * the fasteners driven this build are ephemeral — assembly only spends,
 * so it commits whole (decision 4).
 */

const GHOST = 0xf5efe3;
const GHOST_CANDIDATE = 0xd97c26;

/** How long the strike's flash lingers over a driven fastener. */
const DRIVE_SECONDS = 0.24;

export class BenchAssemblyView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private layer: Graphics & GameSprite;
  /** Fasteners driven this build — ephemeral until the commit. */
  private driven: BlueprintFastener[] = [];
  /** The strike playing out right now. */
  private driving: { fastener: BlueprintFastener; secondsLeft: number } | null =
    null;
  private hovered: BlueprintFastener | null = null;

  constructor() {
    super();
    this.layer = new Graphics() as Graphics & GameSprite;
    this.layer.layerName = "hud";
    this.sprite = this.layer;
  }

  /** How the build stands: parts seated and fasteners driven, of how
   * many the drawing asks for. Null when no drawing is out. */
  assemblyProgress(): {
    seated: number;
    slots: number;
    driven: number;
    fasteners: number;
    /** What the drawing fastens with, and whether that's in hand. */
    fastenerId: ConsumableId;
    driver: ToolId | null;
    driverHeld: boolean;
    /** An empty outline wanting a piece stood up, and how. */
    tipUp: { role: string; onEnd: boolean } | null;
  } | null {
    const build = this.build();
    if (!build) return null;
    const tipUp = build.blueprint.slots.find(
      (slot) => !build.seated.has(slot.id) && (slot.onEdge || slot.onEnd),
    );
    return {
      seated: build.seated.size,
      slots: build.blueprint.slots.length,
      driven: this.driven.length,
      fasteners: build.blueprint.fasteners.length,
      fastenerId: build.blueprint.fastenerConsumable,
      driver: fastenerToolId(build.blueprint.fastenerConsumable),
      driverHeld: this.driverHeld(build.blueprint),
      tipUp: tipUp ? { role: tipUp.role, onEnd: tipUp.onEnd === true } : null,
    };
  }

  /** Where the armed crossings sit on screen — the seam a spec drives
   * a real fastener through. */
  fastenerPoints(): ReadonlyArray<{ x: number; y: number }> {
    const build = this.build();
    const stage = benchStage(this.game);
    if (!build || !stage) return [];
    return this.armed(build).map((fastener) => {
      const at = fastenerOnBench(
        build.blueprint,
        build.productPlacement,
        fastener,
      );
      return {
        x: stage.fit.originX + at.xIn * stage.fit.pxPerIn,
        y: stage.fit.originY + at.yIn * stage.fit.pxPerIn,
      };
    });
  }

  /** Where each empty outline sits on screen, by slot id. */
  slotPoints(): ReadonlyArray<{ id: string; x: number; y: number }> {
    const build = this.build();
    const stage = benchStage(this.game);
    if (!build || !stage) return [];
    return build.blueprint.slots.map((slot) => {
      const seat = slotOnBench(build.blueprint, build.productPlacement, slot);
      return {
        id: slot.id,
        x: stage.fit.originX + seat.xIn * stage.fit.pxPerIn,
        y: stage.fit.originY + seat.yIn * stage.fit.pxPerIn,
      };
    });
  }

  private dive(): BenchDive | undefined {
    return this.game.entities.tryGetSingleton(BenchDive);
  }

  /**
   * The build in front of the player: the drawing out on the bench, the
   * frame it sits in, and which piece is on which outline. Null when no
   * drawing is pulled or the bench is already running something.
   */
  private build(): {
    blueprint: ProductBlueprint;
    productPlacement: BenchPlacement;
    seated: ReadonlyMap<string, string>;
    pieces: Array<{ material: MaterialInstance; placement: BenchPlacement }>;
  } | null {
    const dive = this.dive();
    const run = openBenchGroup(this.game);
    if (!dive || dive.openBenchKey === null || !run) return null;
    const opened = run.opened;
    if (opened.operationProgress.status === "inProgress") return null;
    const plan = selectedBenchPlan(opened);
    const interaction = plan?.interaction;
    if (!plan || interaction?.kind !== "assembly") return null;
    const blueprint = productBlueprintFor(interaction.blueprint);
    if (!blueprint) return null;
    const productPlacement = assemblyFramePlacement(
      benchTopSizeIn(opened.type),
    );
    // Only staged stock can be laid on an outline; finished work lying
    // about is somebody else's piece.
    const pieces = groupPieces(run.group)
      .filter((piece) => piece.bay === "input")
      .map((piece) => ({
        material: piece.material,
        placement: piece.placement,
      }));
    return {
      blueprint,
      productPlacement,
      seated: seatedParts(blueprint, productPlacement, pieces),
      pieces,
    };
  }

  /** Crossings whose both parts are seated and not yet driven. */
  private armed(
    build: NonNullable<ReturnType<BenchAssemblyView["build"]>>,
  ): ReadonlyArray<BlueprintFastener> {
    return armedFasteners(build.blueprint, build.seated).filter(
      (fastener) => !this.driven.includes(fastener),
    );
  }

  /** Whether the drawing's own driving tool is in hand. */
  private driverHeld(blueprint: ProductBlueprint): boolean {
    const tool = fastenerToolId(blueprint.fastenerConsumable);
    return tool !== null && this.dive()?.heldTool === tool;
  }

  /**
   * Where a dragged piece would settle if it were let go now — the
   * arranging view asks this on release, so a part laid near its outline
   * lands *on* it.
   */
  snapFor(
    material: MaterialInstance,
    placement: BenchPlacement,
  ): BenchPlacement | null {
    const build = this.build();
    if (!build) return null;
    const taken = new Set(
      [...build.seated.entries()]
        .filter(([, materialId]) => materialId !== material.id)
        .map(([slotId]) => slotId),
    );
    return (
      snapPlacementFor(
        build.blueprint,
        build.productPlacement,
        material,
        placement,
        taken,
      )?.placement ?? null
    );
  }

  /** Pieces a driven fastener holds: nailed on, so they don't move. */
  fastened(): ReadonlySet<string> {
    const build = this.build();
    if (!build) return new Set();
    return fastenedPieceIds(build.seated, this.driven);
  }

  @on("tick")
  onTick(dt: number) {
    if (this.driving) {
      this.driving.secondsLeft -= dt;
      if (this.driving.secondsLeft <= 0) this.driving = null;
    }
    const build = this.build();
    if (!build) {
      // A drawing put away (or a build committed) starts the next one
      // with an empty schedule.
      if (this.driven.length > 0) this.driven = [];
      this.hovered = null;
      return;
    }
    // A build with no fasteners at all — two planks laid side by side —
    // has nothing to drive: laying the last part on IS the whole build.
    if (
      build.blueprint.fasteners.length === 0 &&
      build.seated.size === build.blueprint.slots.length &&
      build.blueprint.slots.length > 0
    ) {
      this.commit(build);
      return;
    }

    const stage = benchStage(this.game);
    if (!stage || !this.driverHeld(build.blueprint)) {
      this.hovered = null;
      return;
    }
    const at = stagePointer(this.game, stage.fit);
    this.hovered = fastenerAt(
      build.blueprint,
      build.productPlacement,
      this.armed(build),
      at.xIn,
      at.yIn,
    );
  }

  /**
   * One fastener driven at an armed crossing. Everything before the
   * last one is ephemeral — but the last one commits the whole build:
   * the parts are claimed and the product appears, and because the
   * ghost frame is the finished piece's own seat, it lands exactly where
   * the parts were lying. Nothing moves as it becomes one piece.
   */
  @on("mouseDown")
  onMouseDown() {
    const build = this.build();
    const stage = benchStage(this.game);
    if (!build || !stage || !this.driverHeld(build.blueprint)) return;
    const at = stagePointer(this.game, stage.fit);
    const target = fastenerAt(
      build.blueprint,
      build.productPlacement,
      this.armed(build),
      at.xIn,
      at.yIn,
    );
    if (!target) return;
    playSound(
      build.blueprint.fastenerConsumable === "screws"
        ? "drill-driver"
        : "assembly-mallet",
      0.5,
    );
    this.driving = { fastener: target, secondsLeft: DRIVE_SECONDS };
    this.hovered = null;
    this.driven = [...this.driven, target];
    if (this.driven.length >= build.blueprint.fasteners.length) {
      this.commit(build);
    }
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /** Start and finish back to back: the hand work was the build. */
  private commit(
    build: NonNullable<ReturnType<BenchAssemblyView["build"]>>,
  ): void {
    const bench = this.dive()?.openBench();
    if (!bench) return;
    // A build's parts may have been laid on from either table of a run;
    // the operation claims from one, so gather them onto it first.
    gatherBenchPieces(
      this.game,
      bench,
      build.pieces.map((piece) => piece.material.id),
    );
    if (operateMachine(this.game, bench)) {
      finishAttendedWork(this.game, bench);
    }
    this.driven = [];
    this.driving = null;
    this.hovered = null;
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  @on("render")
  onRender() {
    const g = this.layer;
    g.clear();
    const build = this.build();
    const stage = benchStage(this.game);
    if (!build || !stage) return;
    const fit = stage.fit;
    const dragging = this.game.entities
      .tryGetSingleton(BenchArrangeView)
      ?.draggingId();

    // The empty outlines, and the one a dragged part would settle on.
    const candidate = dragging ? this.snapSlotFor(build, dragging) : null;
    for (const slot of build.blueprint.slots) {
      if (build.seated.has(slot.id)) continue;
      const seat = slotOnBench(build.blueprint, build.productPlacement, slot);
      const { wIn, hIn } = slotFootprintIn(slot);
      const isCandidate = candidate === slot.id;
      g.poly(outlineOf(seat, wIn, hIn, fit)).stroke({
        width: isCandidate ? 3 : 2,
        color: isCandidate ? GHOST_CANDIDATE : GHOST,
        alpha: isCandidate ? 0.95 : 0.4,
      });
    }

    // Fastener chrome over the seated parts: driven heads are real
    // hardware now, armed crossings ring up while the driving tool is in
    // hand, and the strike flashes over the head it just set.
    const toStage = (fastener: BlueprintFastener) => {
      const at = fastenerOnBench(
        build.blueprint,
        build.productPlacement,
        fastener,
      );
      return {
        x: fit.originX + at.xIn * fit.pxPerIn,
        y: fit.originY + at.yIn * fit.pxPerIn,
      };
    };
    for (const fastener of this.driven) {
      const { x, y } = toStage(fastener);
      drawFastenerHead(
        g,
        x,
        y,
        Math.max(0.28 * fit.pxPerIn, 2),
        build.blueprint.fastenerConsumable,
      );
    }
    if (this.driverHeld(build.blueprint)) {
      for (const fastener of this.armed(build)) {
        const { x, y } = toStage(fastener);
        if (this.hovered === fastener) {
          g.circle(x, y, 9).fill({ color: GHOST_CANDIDATE, alpha: 0.2 });
          g.circle(x, y, 9).stroke({
            width: 3,
            color: GHOST_CANDIDATE,
            alpha: 1,
          });
        } else {
          g.circle(x, y, 7).stroke({ width: 2.5, color: GHOST, alpha: 0.95 });
        }
      }
    }
    if (this.driving) {
      const { x, y } = toStage(this.driving.fastener);
      g.circle(x, y, 10).stroke({
        width: 2.5,
        color: GHOST_CANDIDATE,
        alpha: 0.95,
      });
    }
  }

  /** Which outline the dragged piece is hovering over, if any. */
  private snapSlotFor(
    build: NonNullable<ReturnType<BenchAssemblyView["build"]>>,
    materialId: string,
  ): string | null {
    const piece = build.pieces.find(
      (candidate) => candidate.material.id === materialId,
    );
    if (!piece) return null;
    const taken = new Set(
      [...build.seated.entries()]
        .filter(([, id]) => id !== materialId)
        .map(([slotId]) => slotId),
    );
    return (
      snapPlacementFor(
        build.blueprint,
        build.productPlacement,
        piece.material,
        piece.placement,
        taken,
      )?.slotId ?? null
    );
  }
}

/** A slot's outline on the stage, in screen px. */
function outlineOf(
  seat: { xIn: number; yIn: number; angleDeg: number },
  wIn: number,
  hIn: number,
  fit: StageFit,
): number[] {
  const radians = (seat.angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corner = (dx: number, dy: number) => [
    fit.originX + (seat.xIn + dx * cos - dy * sin) * fit.pxPerIn,
    fit.originY + (seat.yIn + dx * sin + dy * cos) * fit.pxPerIn,
  ];
  return [
    ...corner(-wIn / 2, -hIn / 2),
    ...corner(wIn / 2, -hIn / 2),
    ...corner(wIn / 2, hIn / 2),
    ...corner(-wIn / 2, hIn / 2),
  ];
}
