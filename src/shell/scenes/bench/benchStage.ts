import {
  fitToStage,
  StageFit,
  StageRect,
} from "../../../components/bench-view/stageMath";
import { Game } from "../../../core/Game";
import { BenchGroup, benchGroupAt } from "../../../game/bench-work/bench-group";
import { getMachines, Machine, machineKey } from "../../../game/Machine";
import { projectGameState } from "../../../sim/projection";
import { BenchDive } from "./BenchDive";

/**
 * The opened bench: its run, and where that run lands on screen.
 *
 * Deliberately not cached on the view: the gesture surfaces read this
 * during the tick, and a render-time cache is one frame stale — which
 * is exactly the frame a press lands in. A press claims the workpiece
 * into the operation, and a stale run still shows it lying on the pile.
 * Reading it fresh also keeps what a gesture points at and what the
 * view drew from drifting apart when the window changes size.
 */

/** The screen the run is fitted into, inset for the dive's chrome: the
 * tool rail across the top, the status line along the bottom, a margin
 * at the sides. The old scene's insets, so a bench frames up the same. */
const TOP_CHROME_PX = 152;
const BOTTOM_CHROME_PX = 96;
const SIDE_CHROME_PX = 24;

export interface BenchStage {
  readonly group: BenchGroup;
  readonly opened: Machine;
  /** Inches to screen pixels, for the stage between the chrome bands. */
  readonly fit: StageFit;
}

/** The opened bench's run, or null when nobody is leaned over one. */
export function openBenchGroup(
  game: Game,
): { group: BenchGroup; opened: Machine } | null {
  const dive = game.entities.tryGetSingleton(BenchDive);
  const bench = dive?.openBench();
  if (!bench) return null;
  const machines = getMachines(projectGameState(game).machines);
  const key = machineKey(bench.state);
  const opened = machines.find((machine) => machineKey(machine.state) === key);
  if (!opened) return null;
  return { group: benchGroupAt(machines, opened), opened };
}

/** That run plus its place on screen (null with no renderer). */
export function benchStage(game: Game): BenchStage | null {
  const renderer = game.renderer;
  const run = openBenchGroup(game);
  if (!renderer || !run) return null;
  const stage: StageRect = {
    x: SIDE_CHROME_PX,
    y: TOP_CHROME_PX,
    width: renderer.getWidth() - SIDE_CHROME_PX * 2,
    height: renderer.getHeight() - TOP_CHROME_PX - BOTTOM_CHROME_PX,
  };
  const fit = fitToStage(
    { widthIn: run.group.widthIn, heightIn: run.group.heightIn },
    stage,
  );
  return { group: run.group, opened: run.opened, fit };
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
