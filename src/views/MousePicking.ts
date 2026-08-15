import { PIXELS_PER_CELL } from "../components/shop-view/shop-scale";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { materialSources } from "../game/interact";
import { Machine } from "../game/Machine";
import { getMachineOccupiedCells } from "../game/game-actions/machine-actions";
import { pileWithinReach } from "../game/pile-helpers";
import { GameState, MaterialPile } from "../game/GameState";
import { Vector } from "../game/Vectors";
import { hasStationSheet } from "../components/station/station-helpers";
import { TargetingState } from "../shell/dispatch/TargetingState";
import { Player } from "../sim/entities/Player";
import { projectGameState } from "../sim/projection";

/**
 * The mouse as the eye (docs/floor-interaction.md): the cursor never
 * acts at a distance — it chooses among what the body can already
 * reach, and right-click opens what's under it.
 *
 * The old shell hit-tested through invisible footprint shapes drawn
 * under the stock; here the picking is arithmetic —
 * `camera.toWorld(io.mousePosition)` down to a cell, tested against
 * machine footprints and reachable piles — which is the migration
 * plan's spelling of the same test.
 */
export class MousePicking extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  /** The cursor's world cell, or null before the first move. */
  private cursorWorld: Vector | null = null;

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

  /** The reachable machine under the cursor, if any. */
  private machineUnderCursor(gs: GameState): Machine | null {
    const cursor = this.cursorWorld;
    if (!cursor) return null;
    const cell: Vector = [Math.floor(cursor[0]), Math.floor(cursor[1])];
    const targeting = this.targeting();
    for (const machine of targeting.machines()) {
      const cells = getMachineOccupiedCells(
        machine.type,
        machine.position,
        machine.rotation,
      );
      if (cells.some(([x, y]) => x === cell[0] && y === cell[1])) {
        return machine;
      }
    }
    return null;
  }

  /** The reachable floor piece under the cursor, if any. */
  private pileUnderCursor(gs: GameState): MaterialPile | null {
    const cursor = this.cursorWorld;
    if (!cursor) return null;
    let best: MaterialPile | null = null;
    let bestDistance = 0.75; // about a piece's half-footprint, in cells
    for (const pile of gs.materialPiles) {
      if (!pileWithinReach(pile, gs.player.position)) continue;
      const distance = Math.hypot(
        pile.position[0] - cursor[0],
        pile.position[1] - cursor[1],
      );
      if (distance < bestDistance) {
        best = pile;
        bestDistance = distance;
      }
    }
    return best;
  }

  @on("tick")
  onTick() {
    if (!this.game.entities.tryGetSingleton(Player)) return;
    const cell = this.cursorCell();
    if (!cell) return;
    // Hover re-picks only while the cursor moves, so the keyboard's own
    // cycling isn't fought every tick.
    if (
      this.cursorWorld &&
      Math.abs(cell[0] - this.cursorWorld[0]) < 1e-6 &&
      Math.abs(cell[1] - this.cursorWorld[1]) < 1e-6
    ) {
      return;
    }
    this.cursorWorld = cell;

    const gs = projectGameState(this.game);
    if (gs.player.away) return;
    const machine = this.machineUnderCursor(gs);
    if (machine) {
      this.targeting().setTarget(machine);
      return;
    }
    const pile = this.pileUnderCursor(gs);
    if (pile) {
      this.targeting().setPileTarget(pile);
    }
  }

  @on("rightDown")
  onRightDown() {
    if (!this.game.entities.tryGetSingleton(Player)) return;
    const gs = projectGameState(this.game);
    if (gs.player.away) return;
    this.cursorWorld = this.cursorCell();

    // A station's sheet for the machine under the cursor…
    const machine = this.machineUnderCursor(gs);
    if (machine && hasStationSheet(machine)) {
      this.targeting().setTarget(machine);
      this.targeting().openSheet(machine);
      return;
    }
    // …or the card listing every piece in reach, since a stack is
    // otherwise opaque from above.
    const targetedView = this.targeting().targeted()?.view();
    if (
      this.pileUnderCursor(gs) &&
      materialSources(gs, targetedView).some((s) => s.kind === "floor-pile")
    ) {
      this.targeting().openFloorSheet();
    }
  }
}
