import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { on } from "../../../core/entity/handler";
import { getMachines, machineKey } from "../../../game/Machine";
import { benchGroupAt } from "../../../game/bench-work/bench-group";
import { projectGameState } from "../../../sim/projection";
import { PalletNail } from "../../../game/Materials";
import { ToolId } from "../../../game/Tool";
import { MachineEntity } from "../../../sim/entities/MachineEntity";
import { Player } from "../../../sim/entities/Player";
import { ShellStore } from "../../ShellStore";

/** How long the lean-in takes, each way. */
const DIVE_SECONDS = 0.65;

/** Motion the player has asked not to see is pinned, not played. */
function reducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

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
   * The bench the view is still rolling back off, once the player has
   * stood up: the gestures stop the moment `openBenchKey` clears, but
   * the picture keeps the bench until the lean-in has run backwards.
   */
  closingKey: string | null = null;

  /**
   * How far the lean-in has run, 0..1. Opening a bench doesn't cut to
   * it — the view eases in from the bench's own footprint on the floor
   * — and standing up runs the same ramp backwards. Reduced motion pins
   * it, and nothing on the surface answers the pointer until it lands
   * (the old view's `settled`).
   */
  dive = 0;

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
    const key = machineKey(bench.state);
    // Re-opening the bench being rolled back off just re-leans in from
    // wherever the ramp is; a different bench starts its own dive.
    if (this.closingKey !== null && this.closingKey !== key) this.dive = 0;
    this.openBenchKey = key;
    this.closingKey = null;
    if (reducedMotion()) this.dive = 1;
    this.bump();
  }

  close(): void {
    if (this.openBenchKey === null) return;
    this.closingKey = this.openBenchKey;
    this.openBenchKey = null;
    if (reducedMotion()) {
      this.dive = 0;
      this.closingKey = null;
    }
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

  /** Whether the lean-in has landed: until it does, the surface is a
   * picture in motion and nothing on it answers the pointer. */
  settled(): boolean {
    return this.openBenchKey !== null && this.dive >= 1;
  }

  /** The opened bench's live entity, or null once it's out of reach. */
  openBench(): MachineEntity | null {
    return this.benchFor(this.openBenchKey);
  }

  /** The bench the view is drawing — the open one, or the one still
   * rolling back off the screen. */
  displayedBench(): MachineEntity | null {
    return this.benchFor(this.openBenchKey ?? this.closingKey);
  }

  /**
   * The machineKeys of every table in the displayed bench's group, or
   * null on the shop floor. The dive's close-up covers the whole run of
   * pushed-together tables, so the shop view hides all their staged
   * stock, not just the opened one's (see MachineView). Cached by the
   * displayed key: the group can't change while the player is leaned
   * over it.
   */
  displayedGroupKeys(): ReadonlySet<string> | null {
    const key = this.openBenchKey ?? this.closingKey;
    if (key === null) {
      this.groupKeysFor = null;
      this.groupKeys = null;
      return null;
    }
    if (this.groupKeysFor !== key) {
      const machines = getMachines(projectGameState(this.game).machines);
      const opened = machines.find(
        (machine) => machineKey(machine.state) === key,
      );
      this.groupKeysFor = key;
      this.groupKeys = opened
        ? new Set(
            benchGroupAt(machines, opened).members.map((member) =>
              machineKey(member.machine.state),
            ),
          )
        : new Set([key]);
    }
    return this.groupKeys;
  }
  private groupKeysFor: string | null = null;
  private groupKeys: ReadonlySet<string> | null = null;

  private benchFor(key: string | null): MachineEntity | null {
    if (key === null) return null;
    for (const machine of this.game.entities.byConstructor(MachineEntity)) {
      if (machineKey(machine.state) === key) {
        return machine;
      }
    }
    return null;
  }

  @on("tick")
  onTick(dt: number) {
    // A held tool or clamp IS the pointer (the tool-icon cursor in
    // BenchStageMarker, the glue view's clamp ghost) — the native arrow
    // under it would read as two hands.
    this.game.renderer?.setCursor(
      this.openBenchKey !== null &&
        (this.heldTool !== null || this.holdingClamp)
        ? "none"
        : "auto",
    );

    // The lean-in runs on real time, like the truck's roll: forward
    // while a bench is open, backwards once the player stands up.
    const target = this.openBenchKey === null ? 0 : 1;
    if (this.dive !== target) {
      const step = dt / DIVE_SECONDS;
      this.dive =
        target > this.dive
          ? Math.min(1, this.dive + step)
          : Math.max(0, this.dive - step);
      if (this.dive === 0 && this.closingKey !== null) this.closingKey = null;
      this.bump();
    }
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
