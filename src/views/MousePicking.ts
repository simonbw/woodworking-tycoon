import { PIXELS_PER_CELL } from "./shop-scale";
import { FloorPick, pickUnderCursor } from "./floor-picking";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { materialSources } from "../game/interact";
import { GameState } from "../game/GameState";
import { Vector } from "../game/Vectors";
import {
  divesToBench,
  hasStationSheet,
} from "../components/station/station-helpers";
import {
  findMachineEntity,
  shopCellMap,
} from "../sim/commands/machine-commands";
import { TargetingState } from "../shell/dispatch/TargetingState";
import { BenchDive } from "../shell/scenes/bench/BenchDive";
import { ShellStore } from "../shell/ShellStore";
import { Player } from "../sim/entities/Player";
import { projectGameState } from "../sim/projection";

/**
 * The mouse as the eye (docs/floor-interaction.md): the cursor never
 * acts at a distance — it chooses among what the body can already
 * reach, and right-click opens what's under it.
 *
 * The old shell hit-tested through invisible footprint shapes drawn
 * under the stock; here the picking is arithmetic —
 * `camera.toWorld(io.mousePosition)` down to a cell, tested against the
 * pieces in reach and the machines' footprints (floor-picking.ts, which
 * holds the stock-over-station rule) — the migration plan's spelling of
 * the same test.
 *
 * Only the pieces the interact resolver is offering answer the cursor,
 * so a board you have no free hands to take lets the machine under it
 * answer instead.
 */
export class MousePicking extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  /** The cursor's world cell, or null before the first move. */
  private cursorWorld: Vector | null = null;
  /** Where the cursor last sat on screen, for spotting real movement. */
  private cursorScreen: Vector | null = null;

  private targeting(): TargetingState {
    return this.game.entities.getSingleton(TargetingState);
  }

  /** The cursor, in continuous cell coordinates. */
  private cursorCell(): Vector | null {
    const renderer = this.game.renderer;
    if (!renderer) return null;
    const world = this.game.camera.toWorld(this.game.io.mousePosition);
    return [world[0] / PIXELS_PER_CELL, world[1] / PIXELS_PER_CELL];
  }

  /**
   * What the cursor has hold of. The floor's pieces come from the
   * interact resolver, newest-dropped first — the order they're drawn
   * in — so the first one the cursor lands on is the top of the stack.
   */
  private pick(gs: GameState): FloorPick | null {
    const cursor = this.cursorWorld;
    if (!cursor) return null;
    const targeting = this.targeting();
    const piles = materialSources(
      gs,
      shopCellMap(this.game),
      targeting.targeted()?.view(),
    )
      .filter((source) => source.kind === "floor-pile")
      .map((source) => source.pile);
    return pickUnderCursor(cursor, piles, targeting.machines());
  }

  /** The world the cursor is picking in, or null while it can't pick. */
  private pickableState(): GameState | null {
    if (!this.game.entities.tryGetSingleton(Player)) return null;
    if (this.game.entities.tryGetSingleton(ShellStore)?.modalOpen) return null;
    // Leaned over a bench the pointer is a hand on the work surface,
    // not an eye on the floor.
    if (this.game.entities.tryGetSingleton(BenchDive)?.openBenchKey != null) {
      return null;
    }
    const gs = projectGameState(this.game);
    return gs.player.away ? null : gs;
  }

  @on("tick")
  onTick() {
    if (!this.game.entities.tryGetSingleton(Player)) return;
    if (this.game.entities.tryGetSingleton(ShellStore)?.modalOpen) return;
    if (this.game.entities.tryGetSingleton(BenchDive)?.openBenchKey != null) {
      return;
    }
    // Hover re-picks only while the cursor moves, so the keyboard's own
    // cycling isn't fought every tick. Measured on screen rather than in
    // the world: a gliding camera slides the world under a resting
    // cursor, and that isn't the player pointing at anything new.
    const screen = this.game.io.mousePosition;
    if (
      this.cursorScreen &&
      screen[0] === this.cursorScreen[0] &&
      screen[1] === this.cursorScreen[1]
    ) {
      return;
    }
    this.cursorScreen = [screen[0], screen[1]];

    const cell = this.cursorCell();
    if (!cell) return;
    this.cursorWorld = cell;

    const gs = this.pickableState();
    if (!gs) return;
    const pick = this.pick(gs);
    if (pick?.kind === "pile") this.targeting().setPileTarget(pick.pile);
    if (pick?.kind === "machine") this.targeting().setTarget(pick.machine);
  }

  /**
   * Left-click picks a station out of the ones within reach, and
   * clicking the one already picked opens it — the sheet for a station
   * that has one, the lean over the work surface at a bench. A piece of
   * stock lying on top swallows the click the way it swallows the hover.
   */
  @on("click")
  onClick() {
    const gs = this.pickableState();
    if (!gs) return;
    this.cursorWorld = this.cursorCell();
    const pick = this.pick(gs);
    if (pick?.kind !== "machine") return;

    const machine = pick.machine;
    const targeting = this.targeting();
    if (!targeting.isTargeted(machine)) {
      targeting.setTarget(machine);
      return;
    }
    if (divesToBench(machine, gs.progression)) {
      const entity = findMachineEntity(this.game, machine.state);
      if (entity) this.game.entities.tryGetSingleton(BenchDive)?.open(entity);
      return;
    }
    if (hasStationSheet(machine)) targeting.toggleSheet();
  }

  @on("rightDown")
  onRightDown() {
    const gs = this.pickableState();
    if (!gs) return;
    this.cursorWorld = this.cursorCell();
    const pick = this.pick(gs);

    // The card listing every piece in reach, since a stack is otherwise
    // opaque from above.
    if (pick?.kind === "pile") {
      this.targeting().setPileTarget(pick.pile);
      this.targeting().openFloorSheet();
      return;
    }
    if (pick?.kind !== "machine") return;

    // …or a station's sheet — or, at a bench, the lean over its work
    // surface, which is what a bench has instead of a sheet (the same
    // thing Tab opens there).
    const machine = pick.machine;
    if (divesToBench(machine, gs.progression)) {
      const entity = findMachineEntity(this.game, machine.state);
      if (entity) {
        this.targeting().setTarget(machine);
        this.game.entities.tryGetSingleton(BenchDive)?.open(entity);
        return;
      }
    }
    if (hasStationSheet(machine)) {
      this.targeting().setTarget(machine);
      this.targeting().openSheet(machine);
    }
  }
}
