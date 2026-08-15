import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { on } from "../../../core/entity/handler";
import { machineKey } from "../../../game/Machine";
import { MachineEntity } from "../../../sim/entities/MachineEntity";
import { Player } from "../../../sim/entities/Player";
import { ShellStore } from "../../ShellStore";

/**
 * Which bench the player is leaned over (migration phase 7) — the old
 * benchSceneSlot's open/closed half as a shell entity. Tab at a
 * worktable opens the dive (the phase-4 note's deferral); Tab or Escape
 * closes it. Transient UI state, never serialized: a reload stands the
 * player back up, exactly as the old shell's remount did.
 *
 * The world keeps ticking underneath — the dive holds only the walk
 * (the body stays in its working stance at the bench), not the sim.
 */
export class BenchDive extends BaseEntity implements Entity {
  id = "benchDive";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  /** machineKey of the opened bench, or null on the shop floor. */
  openBenchKey: string | null = null;

  open(bench: MachineEntity): void {
    this.openBenchKey = machineKey(bench.state);
    this.bump();
  }

  close(): void {
    if (this.openBenchKey === null) return;
    this.openBenchKey = null;
    this.bump();
  }

  /** The opened bench's live entity, or null once it's out of reach. */
  openBench(): MachineEntity | null {
    if (this.openBenchKey === null) return null;
    for (const machine of this.game.entities.byConstructor(MachineEntity)) {
      if (machineKey(machine.state) === this.openBenchKey) {
        return machine;
      }
    }
    return null;
  }

  @on("tick")
  onTick() {
    if (this.openBenchKey === null) return;
    // The dive folds when its bench stops making sense: the bench gone
    // (picked up by a fixture load), the player away, or no player at
    // all (quit to the menu).
    const player = this.game.entities.tryGetSingleton(Player);
    if (!player || player.away !== null || this.openBench() === null) {
      this.close();
    }
  }

  private bump(): void {
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }
}
