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

/**
 * Feeds held movement keys (WASD/arrows/stick) into the player's move
 * input every engine tick — the walking half of input, needed for the
 * phase-3 walkable-shop gate. The full ShortcutDispatcher (operate,
 * wait, interaction keys, scopes) is phase 4.
 */
export class MovementInput extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  tickLayer: TickLayerName = "input";

  @on("tick")
  onTick() {
    if (!this.game.entities.tryGetSingleton(Player)) return;
    // An open dialog owns the keyboard: the body stands still under it.
    // Leaned over a bench likewise — the dive holds the walk.
    if (
      this.game.entities.tryGetSingleton(ShellStore)?.modalOpen ||
      this.game.entities.tryGetSingleton(BenchDive)?.openBenchKey != null
    ) {
      setMoveInput(this.game, [0, 0]);
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
}
