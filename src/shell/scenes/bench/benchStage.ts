import { StageFit } from "./stageMath";
import { Game } from "../../../core/Game";
import {
  BenchPlacement,
  benchPlacementFor,
  benchPointInFrame,
  framePointOnBench,
} from "../../../game/bench-work/bench-layout";
import {
  BenchGroup,
  GroupPiece,
  groupPieces,
  placementInFrame,
} from "../../../game/bench-work/bench-group";
import { BenchScript, placedPieceSize } from "../../../game/bench-work/workpiece";
import { Machine, machineKey } from "../../../game/Machine";
import { MaterialInstance } from "../../../game/Materials";
import { BenchDive, BenchStage } from "./BenchDive";

/**
 * The opened bench: its run, and where that run lands on screen.
 *
 * The run, the fit, and the live script are owned and cached by the
 * `BenchDive` entity, dropped the moment a domain event says their
 * inputs moved (issue #230, phase 2) — dispatch is synchronous, so a
 * press's own commit invalidates before the next read, and a stale run
 * can never show a claimed workpiece still lying on the pile. These
 * free functions are the read surface the gesture code and the views
 * share; they delegate to the dive.
 */

export type { BenchStage } from "./BenchDive";

/** The opened bench's run, or null when nobody is leaned over one.
 * The displayed bench, not the open one: the picture keeps the bench
 * through the roll-back after the player has stood up. */
export function openBenchGroup(
  game: Game,
): { group: BenchGroup; opened: Machine } | null {
  return game.entities.tryGetSingleton(BenchDive)?.run() ?? null;
}

/** That run plus its place on screen (null with no renderer). */
export function benchStage(game: Game): BenchStage | null {
  return game.entities.tryGetSingleton(BenchDive)?.stage() ?? null;
}

/**
 * Whether the surface is holding still enough to be worked. The stage's
 * inches only line up with what's drawn once the lean-in has landed, so
 * a press mid-dive would land where a piece is about to be rather than
 * where it looks — the old scene's `settled` gate, in one place.
 */
export function stageSettled(game: Game): boolean {
  return game.entities.tryGetSingleton(BenchDive)?.settled() ?? false;
}

/** The pointer in the run's frame, in inches. */
export function stagePointer(
  game: Game,
  fit: StageFit,
): { xIn: number; yIn: number } {
  const [px, py] = game.io.mousePosition;
  return {
    xIn: (px - fit.originX) / fit.pxPerIn,
    yIn: (py - fit.originY) / fit.pxPerIn,
  };
}

/**
 * What the run is doing right now: the script the pure engine reads out
 * of the tables' state, and which table is running it. Tables pushed
 * together work as one bench, so the work may belong to the neighbour
 * of the one the player opened.
 */
export function benchWork(
  game: Game,
): { machine: Machine; script: BenchScript } | null {
  return game.entities.tryGetSingleton(BenchDive)?.work() ?? null;
}

/** Where a piece lies and how big it is, in the run's frame. */
export interface PieceSpot {
  readonly id: string;
  readonly placement: BenchPlacement;
  readonly size: { widthIn: number; heightIn: number };
}

/**
 * Where the piece a running operation holds lies. It left the pile when
 * the operation claimed it (`processingMaterials`), so the group's own
 * piece list no longer carries it — the machine running the work and
 * its seat in the frame are what's left to go on.
 */
export function workpieceSpot(
  group: BenchGroup,
  machine: Machine,
  workpiece: MaterialInstance,
): PieceSpot | null {
  const key = machineKey(machine.state);
  const member = group.members.find(
    (candidate) => machineKey(candidate.machine.state) === key,
  );
  if (!member) return null;
  const onMember = benchPlacementFor(machine, workpiece);
  return {
    id: workpiece.id,
    placement: placementInFrame(group, member, onMember),
    size: placedPieceSize(workpiece, onMember),
  };
}

/** A placed piece's four corners on the stage, in screen px. */
export function pieceCorners(
  placement: BenchPlacement,
  size: { widthIn: number; heightIn: number },
  fit: StageFit,
): number[] {
  const corners: Array<[number, number]> = [
    [0, 0],
    [size.widthIn, 0],
    [size.widthIn, size.heightIn],
    [0, size.heightIn],
  ];
  return corners.flatMap(([localX, localY]) => {
    const at = framePointOnBench(placement, size, localX, localY);
    return [
      fit.originX + at.xIn * fit.pxPerIn,
      fit.originY + at.yIn * fit.pxPerIn,
    ];
  });
}

/** The piece under a point in the run's frame, top of the stack first. */
export function pieceUnder(
  group: BenchGroup,
  xIn: number,
  yIn: number,
): GroupPiece | null {
  // Last drawn wins, so the piece on top of a stack takes the gesture.
  for (const piece of [...groupPieces(group)].reverse()) {
    if (piece.material.type === "pallet") continue;
    const size = placedPieceSize(piece.material, piece.placement);
    const local = benchPointInFrame(piece.placement, size, xIn, yIn);
    if (
      local.xIn >= 0 &&
      local.yIn >= 0 &&
      local.xIn <= size.widthIn &&
      local.yIn <= size.heightIn
    ) {
      return piece;
    }
  }
  return null;
}
