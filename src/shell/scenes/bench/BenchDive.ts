import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { on } from "../../../core/entity/handler";
import { machineKey } from "../../../game/Machine";
import { PalletNail } from "../../../game/Materials";
import { ToolId } from "../../../game/Tool";
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

  /**
   * The tool in hand — the bench's mode selector (docs/bench-work.md
   * decision 0). Applying it to a valid target IS the operation, so a
   * hammer over a staged pallet is pry mode and nothing else is.
   */
  heldTool: ToolId | null = null;

  /**
   * The glue-up's two hands, which aren't tools on the rail: a bar
   * clamp off the rack, or the glue bottle. Holding either puts the
   * tool down — one thing in the hands at a time.
   */
  holdingClamp = false;
  holdingGlue = false;

  /** The nail the hammer is over, if any — the ring that warms. */
  hoveredNail: PalletNail | null = null;

  /** The pull playing out right now: the nail that just left, and how
   * much of the claw's lever is left to draw (seconds). */
  prying: { nail: PalletNail; secondsLeft: number } | null = null;

  open(bench: MachineEntity): void {
    this.openBenchKey = machineKey(bench.state);
    this.bump();
  }

  close(): void {
    if (this.openBenchKey === null) return;
    this.openBenchKey = null;
    // Standing up empties the hands: the tool goes back on its rail
    // and the clamp and bottle go back on the rack, as the old view's
    // unmount did.
    this.heldTool = null;
    this.holdingClamp = false;
    this.holdingGlue = false;
    this.hoveredNail = null;
    this.prying = null;
    this.bump();
  }

  /** Take a tool in hand, or hang the held one back up. */
  toggleTool(toolId: ToolId): void {
    this.heldTool = this.heldTool === toolId ? null : toolId;
    this.holdingClamp = false;
    this.holdingGlue = false;
    this.hoveredNail = null;
    this.bump();
  }

  /** Pick up a clamp or the glue bottle — or put both down (null). */
  setHolding(what: "clamp" | "glue" | null): void {
    this.holdingClamp = what === "clamp";
    this.holdingGlue = what === "glue";
    // Empty hands are empty: putting the clamp down also hangs up
    // whatever tool was in the other hand.
    this.heldTool = null;
    this.hoveredNail = null;
    this.bump();
  }

  /** Whether the hands are carrying anything at all. */
  handsFull(): boolean {
    return this.heldTool !== null || this.holdingClamp || this.holdingGlue;
  }

  dropTool(): void {
    if (this.heldTool === null) return;
    this.heldTool = null;
    this.hoveredNail = null;
    this.bump();
  }

  /**
   * At a bench the pointer *is* the hand, so the right button puts back
   * whatever it's holding — the same move Escape makes, without
   * reaching for the keyboard.
   */
  @on("rightDown")
  onRightDown() {
    if (this.openBenchKey === null || !this.handsFull()) return;
    this.setHolding(null);
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
  onTick(dt: number) {
    if (this.openBenchKey === null) return;
    if (this.prying) {
      this.prying =
        this.prying.secondsLeft <= dt
          ? null
          : { ...this.prying, secondsLeft: this.prying.secondsLeft - dt };
    }
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
