import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { on } from "../../../core/entity/handler";
import { Machine, machineKey } from "../../../game/Machine";
import { BenchGroup, benchGroupAt } from "../../../game/bench-work/bench-group";
import { BenchScript, benchGroupWork } from "../../../game/bench-work/workpiece";
import { projectProgression } from "../../../sim/projection";
import { PalletNail } from "../../../game/Materials";
import { ToolId } from "../../../game/Tool";
import { MachineEntity } from "../../../sim/entities/MachineEntity";
import { Player } from "../../../sim/entities/Player";
import { ShellStore } from "../../ShellStore";
import { fitToStage, StageFit, StageRect } from "./stageMath";

/** How long the lean-in takes, each way. */
const DIVE_SECONDS = 0.65;

/** The screen the run is fitted into, inset for the dive's chrome: the
 * tool rail across the top, the status line along the bottom, a margin
 * at the sides. The top band clears the rail's full height (the top bar
 * it hangs under, plus its own row of hooks) — wood framed up under the
 * rail would be wood the hand can't reach, since the rail catches the
 * pointer first. */
const TOP_CHROME_PX = 232;
const BOTTOM_CHROME_PX = 96;
const SIDE_CHROME_PX = 24;

/** The opened bench: its run, and where that run lands on screen. */
export interface BenchStage {
  readonly group: BenchGroup;
  readonly opened: Machine;
  /** Inches to screen pixels, for the stage between the chrome bands. */
  readonly fit: StageFit;
}

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
    this.invalidateStage();
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
    this.invalidateStage();
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

  // -------------------------------------------------------------------
  // The stage, dive-owned (issue #230, phase 2). The run, its screen
  // fit, and the live script used to be re-derived by every gesture and
  // view helper each frame; they are cached here and dropped whenever a
  // domain event says the world they were derived from moved. Dispatch
  // is synchronous, so a command's own commit invalidates before the
  // next read — the freshness rule the old per-call derivation protected
  // (a press claims a workpiece; the next read must not show it lying on
  // the pile) holds without any per-frame rebuilding.
  // -------------------------------------------------------------------

  private runCache: { group: BenchGroup; opened: Machine } | null = null;
  private runValid = false;
  private stageCache: BenchStage | null = null;
  private stageRun: { group: BenchGroup; opened: Machine } | null = null;
  private stageWidth = 0;
  private stageHeight = 0;
  private workCache: { machine: Machine; script: BenchScript } | null = null;
  private workValid = false;

  /** The displayed bench's run, or null when nobody is leaned over one. */
  run(): { group: BenchGroup; opened: Machine } | null {
    const bench = this.displayedBench();
    if (!bench) return null;
    if (!this.runValid) {
      const machines = this.floorMachines();
      const key = machineKey(bench.state);
      const opened = machines.find(
        (machine) => machineKey(machine.state) === key,
      );
      this.runCache = opened
        ? { group: benchGroupAt(machines, opened), opened }
        : null;
      this.runValid = true;
    }
    return this.runCache;
  }

  /** That run plus its place on screen (null with no renderer). */
  stage(): BenchStage | null {
    const renderer = this.game.renderer;
    const run = this.run();
    if (!renderer || !run) return null;
    const width = renderer.getWidth();
    const height = renderer.getHeight();
    if (
      this.stageCache === null ||
      this.stageRun !== run ||
      this.stageWidth !== width ||
      this.stageHeight !== height
    ) {
      const stage: StageRect = {
        x: SIDE_CHROME_PX,
        y: TOP_CHROME_PX,
        width: width - SIDE_CHROME_PX * 2,
        height: height - TOP_CHROME_PX - BOTTOM_CHROME_PX,
      };
      const fit = fitToStage(
        { widthIn: run.group.widthIn, heightIn: run.group.heightIn },
        stage,
      );
      this.stageCache = { group: run.group, opened: run.opened, fit };
      this.stageRun = run;
      this.stageWidth = width;
      this.stageHeight = height;
    }
    return this.stageCache;
  }

  /**
   * What the run is doing right now: the script the pure engine reads
   * out of the tables' state, and which table is running it.
   */
  work(): { machine: Machine; script: BenchScript } | null {
    const run = this.run();
    if (!run) return null;
    if (!this.workValid) {
      const work = benchGroupWork(
        run.group.members,
        run.opened,
        projectProgression(this.game),
      );
      this.workCache = work.script
        ? { machine: work.machine, script: work.script }
        : null;
      this.workValid = true;
    }
    return this.workCache;
  }

  private invalidateStage(): void {
    this.runValid = false;
    this.runCache = null;
    this.stageCache = null;
    this.stageRun = null;
    this.workValid = false;
    this.workCache = null;
  }

  @on("machineAdded")
  onMachineAdded() {
    this.invalidateStage();
  }

  @on("machineRemoved")
  onMachineRemoved() {
    this.invalidateStage();
  }

  @on("machineStateChanged")
  onMachineStateChanged() {
    this.invalidateStage();
  }

  @on("progressionChanged")
  onProgressionChanged() {
    // Unlocks decide which scripts the run can offer, not where it lies.
    this.workValid = false;
    this.workCache = null;
  }

  @on("worldLoaded")
  onWorldLoaded() {
    this.invalidateStage();
    this.groupKeysFor = null;
    this.groupKeys = null;
  }

  /** Every placed machine's live view, for the group walk. A hoisted
   * machine stays in the entity list until the end of its tick; a
   * rebuild inside that tick must not include it, or the cached run
   * would hold the ghost until the next mutation. */
  private floorMachines(): Machine[] {
    return [...this.game.entities.byConstructor(MachineEntity)]
      .filter((entity) => !entity.isDestroyed)
      .map((entity) => entity.view());
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
      const machines = this.floorMachines();
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
