import { Container, Graphics } from "pixi.js";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity, GameEventMap } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import {
  BenchGroup,
  BenchGroupMember,
  GroupPiece,
  groupPieces,
  placementOnMember,
  seatInGroup,
} from "../../../game/bench-work/bench-group";
import { BenchPlacement } from "../../../game/bench-work/bench-layout";
import {
  atFlipStop,
  flipStopOf,
  nextFlipStop,
  tumbles,
} from "../../../game/bench-work/flip-cycle";
import { placedPieceSize } from "../../../game/bench-work/workpiece";
import {
  arrangeBenchMaterial,
  gatherBenchPieces,
} from "../../../sim/commands/bench-commands";
import {
  findMachineEntity,
  takeInputsFromMachine,
  takeOutputsFromMachine,
} from "../../../sim/commands/machine-commands";
import { MachineEntity } from "../../../sim/entities/MachineEntity";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { ShellStore } from "../../ShellStore";
import { BenchAssemblyView } from "./BenchAssemblyView";
import { BenchDive } from "./BenchDive";
import {
  benchStage,
  pieceCorners,
  pieceUnder,
  stagePointer,
} from "./benchStage";

/**
 * The bare hands at the bench: dragging stock around the top, turning
 * it (R), tumbling a board onto its edge or end (F), and taking a piece
 * off (E). Where pieces lie is real state, not decoration — the shop
 * floor draws the same arrangement — so every gesture commits through
 * `arrangeBenchMaterial`, and a piece dragged across a seam is bookkept
 * by the table it came to rest on.
 *
 * A piece follows the hand until its *middle* reaches the edge of the
 * wood and then hangs there (`seatInGroup`): stock overhangs a real
 * bench constantly, but a bench can't hold something balanced past its
 * own edge. Turning and tumbling pivot about that middle, so neither
 * ever re-seats a piece.
 *
 * With a tool in hand this view stands down — the tool's own gesture
 * owns the pointer then.
 */

const HOVER = 0xf5efe3;

interface Drag {
  readonly materialId: string;
  /** Live placement in the run's frame, committed on release. */
  placement: BenchPlacement;
  /** Where the hand took hold of it, so it doesn't snap to the cursor. */
  readonly grabDxIn: number;
  readonly grabDyIn: number;
}

export class BenchArrangeView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private root: Container & GameSprite;
  private outline = new Graphics();
  private carried = new Container();
  private drag: Drag | null = null;
  private hoveredId: string | null = null;
  private drawnDragId: string | null = null;

  constructor() {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "hud";
    this.root.addChild(this.outline, this.carried);
    this.sprite = this.root;
  }

  /** The piece riding the hand right now, if any — the dive view skips
   * drawing it so this one can draw it where the hand has it. */
  draggingId(): string | null {
    return this.drag?.materialId ?? null;
  }

  private dive(): BenchDive | undefined {
    return this.game.entities.tryGetSingleton(BenchDive);
  }

  /** Whether the hands are free to arrange — no tool, no clamp, no
   * bottle: whatever the hands are carrying owns the pointer. */
  private handsFree(): boolean {
    const dive = this.dive();
    return dive != null && dive.openBenchKey !== null && !dive.handsFull();
  }

  private stage(): {
    group: BenchGroup;
    pointer: { xIn: number; yIn: number };
  } | null {
    const stage = benchStage(this.game);
    if (!stage) return null;
    return { group: stage.group, pointer: stagePointer(this.game, stage.fit) };
  }

  /** The piece under the hand: the one being dragged, or hovered. */
  private handPiece(group: BenchGroup): GroupPiece | null {
    const id = this.drag?.materialId ?? this.hoveredId;
    if (!id) return null;
    return groupPieces(group).find((piece) => piece.material.id === id) ?? null;
  }

  /** Parts a driven fastener holds — nailed on, so they don't move. */
  private fastened(): ReadonlySet<string> {
    return (
      this.game.entities.tryGetSingleton(BenchAssemblyView)?.fastened() ??
      new Set()
    );
  }

  /** The machine entity behind a member of the run. */
  private entityFor(member: BenchGroupMember): MachineEntity | null {
    return findMachineEntity(this.game, member.machine.state);
  }

  @on("mouseDown")
  onMouseDown() {
    if (!this.handsFree()) return;
    const stage = this.stage();
    if (!stage) return;
    const piece = pieceUnder(stage.group, stage.pointer.xIn, stage.pointer.yIn);
    if (!piece) return;
    // A part a fastener already holds is part of the build: no dragging
    // it back off.
    if (this.fastened().has(piece.material.id)) return;
    this.drag = {
      materialId: piece.material.id,
      placement: piece.placement,
      grabDxIn: piece.placement.xIn - stage.pointer.xIn,
      grabDyIn: piece.placement.yIn - stage.pointer.yIn,
    };
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  @on("mouseUp")
  onMouseUp() {
    this.commitDrag();
  }

  @on("tick")
  onTick() {
    if (!this.handsFree()) {
      if (this.drag) this.commitDrag();
      this.hoveredId = null;
      return;
    }
    const stage = this.stage();
    if (!stage) return;

    if (this.drag) {
      if (!this.game.io.lmb) {
        this.commitDrag();
        return;
      }
      // The run's tops are the working area: the piece follows the hand
      // until its middle reaches the edge of the wood, and hangs there —
      // over a seam it keeps going onto the next table.
      this.drag.placement = seatInGroup(stage.group, {
        ...this.drag.placement,
        xIn: stage.pointer.xIn + this.drag.grabDxIn,
        yIn: stage.pointer.yIn + this.drag.grabDyIn,
      }).placement;
      return;
    }

    const under = pieceUnder(stage.group, stage.pointer.xIn, stage.pointer.yIn);
    this.hoveredId = under?.material.id ?? null;
  }

  /** Set the piece down where the hand left it. */
  private commitDrag(): void {
    const drag = this.drag;
    this.drag = null;
    const stage = this.stage();
    if (!drag || !stage) return;
    // Released near a blueprint outline, the part settles onto it — a
    // slot is the one thing that may seat a piece off the bench, since
    // a plan bigger than the top reaches past the edges on purpose.
    const piece = groupPieces(stage.group).find(
      (candidate) => candidate.material.id === drag.materialId,
    );
    const snapped = piece
      ? (this.game.entities
          .tryGetSingleton(BenchAssemblyView)
          ?.snapFor(piece.material, drag.placement) ?? null)
      : null;
    const landing = snapped
      ? { placement: snapped, member: memberOf(stage.group, drag.materialId) }
      : seatInGroup(stage.group, drag.placement);
    if (!landing.member) return;
    const onto = this.entityFor(landing.member);
    if (!onto) return;
    // Dragged across a seam: the table it came to rest on bookkeeps it
    // now, and its arrangement is measured in that table's inches.
    const from = ownerOf(stage.group, drag.materialId);
    if (from && from.key !== landing.member.key) {
      gatherBenchPieces(this.game, onto, [drag.materialId]);
    }
    arrangeBenchMaterial(
      this.game,
      onto,
      drag.materialId,
      placementOnMember(stage.group, landing.member, landing.placement),
    );
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /**
   * R turns the piece under the hand a quarter turn; F tumbles a board
   * through its three stops (flat, up on edge, up on end) and turns
   * anything else over; E takes it off the bench. Mid-drag the turn
   * rides along and the release commits both.
   */
  @on("keyDown")
  onKeyDown({ key, event }: GameEventMap["keyDown"]) {
    if (!this.handsFree()) return;
    if (key !== "KeyR" && key !== "KeyF" && key !== "KeyE") return;
    const stage = this.stage();
    if (!stage) return;
    const piece = this.handPiece(stage.group);
    if (!piece) return;
    if (this.fastened().has(piece.material.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const holder = this.entityFor(piece.member);
    if (!holder) return;

    if (key === "KeyE") {
      // E takes the piece under the hand — the one being dragged or
      // moused over, never just the first in the bay.
      this.drag = null;
      this.hoveredId = null;
      if (piece.bay === "output") {
        takeOutputsFromMachine(this.game, [piece.material], holder);
      } else {
        takeInputsFromMachine(this.game, [piece.material], holder);
      }
      this.game.entities.tryGetSingleton(ShellStore)?.bump();
      return;
    }

    const current = this.drag?.placement ?? piece.placement;
    // One flip verb: a board cycles flat → up on its long edge → up on
    // its end → flat again; anything else turns over. Mirroring a board
    // face-for-face never showed anyway.
    const turned: BenchPlacement =
      key === "KeyR"
        ? { ...current, angleDeg: current.angleDeg + 90 }
        : tumbles(piece.material)
          ? atFlipStop(current, nextFlipStop(flipStopOf(current)))
          : { ...current, flipped: !current.flipped };

    if (this.drag) {
      this.drag.placement = turned;
      return;
    }
    arrangeBenchMaterial(
      this.game,
      holder,
      piece.material.id,
      placementOnMember(stage.group, piece.member, turned),
    );
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  @on("render")
  onRender() {
    const g = this.outline;
    g.clear();
    const stage = benchStage(this.game);
    if (!stage || !this.handsFree()) {
      this.clearCarried();
      return;
    }
    const { fit, group } = stage;

    // The piece riding the hand, drawn where the hand has it.
    if (this.drag) {
      const piece = this.handPiece(group);
      if (piece) {
        if (this.drawnDragId !== this.drag.materialId) {
          this.clearCarried();
          const sprite = createMaterialSprite(piece.material, {
            onEdge: this.drag.placement.onEdge,
            onEnd: this.drag.placement.onEnd,
          });
          const holder = new Container();
          sprite.scale.set(fit.spriteScale);
          holder.addChild(sprite);
          this.carried.addChild(holder);
          this.drawnDragId = this.drag.materialId;
        }
        const holder = this.carried.children[0];
        if (holder) {
          holder.position.set(
            fit.originX + this.drag.placement.xIn * fit.pxPerIn,
            fit.originY + this.drag.placement.yIn * fit.pxPerIn,
          );
          holder.angle = this.drag.placement.angleDeg;
          holder.scale.x = this.drag.placement.flipped ? -1 : 1;
        }
      }
      return;
    }
    this.clearCarried();

    // Idle: the piece the hand would take hold of wears a hairline.
    const piece = this.handPiece(group);
    if (!piece) return;
    const size = placedPieceSize(piece.material, piece.placement);
    g.poly(pieceCorners(piece.placement, size, fit)).stroke({
      width: 2,
      color: HOVER,
      alpha: 0.5,
    });
  }

  private clearCarried(): void {
    if (this.drawnDragId === null) return;
    this.carried.removeChildren().forEach((child) => child.destroy());
    this.drawnDragId = null;
  }
}

/** The member bookkeeping this piece, or the run's first table. */
function memberOf(group: BenchGroup, materialId: string): BenchGroupMember {
  return ownerOf(group, materialId) ?? group.members[0];
}

/** Which member of the run bookkeeps this piece. */
function ownerOf(group: BenchGroup, materialId: string) {
  return group.members.find((member) =>
    [...member.machine.inputMaterials, ...member.machine.outputMaterials].some(
      (material) => material.id === materialId,
    ),
  );
}
