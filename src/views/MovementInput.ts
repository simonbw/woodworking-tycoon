import { TickLayerName } from "../config/tickLayers";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { setMoveInput } from "../sim/commands/player-commands";
import { Player } from "../sim/entities/Player";
import { BenchDive } from "../shell/scenes/bench/BenchDive";
import { ShellStore } from "../shell/ShellStore";
import { TargetingState } from "../shell/dispatch/TargetingState";
import { Machine } from "../game/Machine";
import { workStance } from "../game/player-motion";

/**
 * Feeds held movement keys (WASD/arrows/stick) into the player's move
 * input every engine tick — the walking half of input, needed for the
 * phase-3 walkable-shop gate. The full ShortcutDispatcher (operate,
 * wait, interaction keys, scopes) is phase 4.
 */
/** How close counts as standing on the spot, in cells. */
const STANCE_SNAP_CELLS = 0.12;

export class MovementInput extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  tickLayer: TickLayerName = "input";

  @on("tick")
  onTick() {
    const player = this.game.entities.tryGetSingleton(Player);
    if (!player) return;
    // An open dialog owns the keyboard: the body stands still under it.
    if (this.game.entities.tryGetSingleton(ShellStore)?.modalOpen) {
      setMoveInput(this.game, [0, 0]);
      return;
    }
    // Leaned over a bench the walk keys are dead, and the body steps
    // into the working stance instead: centered on the bench's
    // operation cell, squared up to the top, so the zoomed-in look
    // finds the woodworker standing at the bench properly.
    const bench = this.game.entities
      .tryGetSingleton(BenchDive)
      ?.openBench()
      ?.view();
    if (bench) {
      this.standAt(player, bench);
      return;
    }
    const [x, y] = this.game.io.getMovementVector();
    // An open trip card is using W/S for its row cursor; only A/D drive
    // the body (the old shell's `captureVertical`).
    const captureVertical =
      this.game.entities.tryGetSingleton(TargetingState)?.truckMenuOpen ??
      false;
    setMoveInput(this.game, [x, captureVertical ? 0 : y]);
  }

  /**
   * Walk the body to a station's working stance and hold it there. The
   * last step lands exactly on the spot — a body drifting a fraction
   * past it would wander for as long as the bench is open.
   */
  private standAt(player: Player, bench: Machine): void {
    const stance = workStance(bench);
    if (!stance) {
      setMoveInput(this.game, [0, 0]);
      return;
    }
    player.direction = stance.direction;
    const dx = stance.pos[0] - player.position[0];
    const dy = stance.pos[1] - player.position[1];
    const distance = Math.hypot(dx, dy);
    if (distance < STANCE_SNAP_CELLS) {
      player.position = [...stance.pos];
      setMoveInput(this.game, [0, 0]);
      return;
    }
    setMoveInput(this.game, [dx / distance, dy / distance]);
  }
}
