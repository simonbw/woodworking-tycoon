import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { SleepSystem } from "../systems/SleepSystem";
import { missingRequiredSingletons, SaveFile, serializeGame } from "./SaveFile";

/**
 * The autosave scheduler: the shop saves itself as it runs.
 *
 * What makes a save owed is the only thing that can possibly be right —
 * the world no longer matching what was last written. Every so often the
 * manager snapshots the world and compares it against the bytes it last
 * stored; a difference queues a write. Nothing has to remember to
 * announce itself, so a change made at night (when the clock is stopped
 * and no minutes pass), a machine carried across the floor, or a command
 * added years from now are all caught the same way, and a world standing
 * still — paused, or nobody touching it — writes nothing at all.
 *
 * Writing is cheap; what we avoid is the *timing*. `schedule()` marks the
 * world dirty and defers the write to an idle moment, so it never lands
 * in the middle of a tick and a burst collapses into one write. Because
 * JavaScript is single-threaded and ticks run synchronously, the idle
 * callback always fires between ticks — the snapshot sits on a tick
 * boundary by construction.
 *
 * `flush()` is the synchronous escape hatch: it takes its own look at the
 * world first, so a change made in the last fraction of a second is still
 * caught. The shell wires it to `pagehide` and to the tab going hidden,
 * where no async turn is left. `cancel()` drops a pending write so a
 * deliberate quit can't resurrect a deleted save.
 *
 * Two worlds are never written. One is a world with no shop in it — the
 * start menu's, before New Game or Continue fills it — which would
 * otherwise overwrite a real save with an empty file. The other is a
 * world mid-overnight: the night runs as a batch of ordinary minutes and
 * a snapshot taken partway through would describe a shop between two
 * days, so saves are held until morning (see SleepSystem).
 *
 * Storage is injected: the browser shell hands in localStorage, tests
 * hand in memory. The manager persists above scene swaps and save loads
 * (Persistence.Permanent) — it manages saves, it is never in one.
 */

export interface SaveStorage {
  write(file: SaveFile): void;
}

/**
 * Ceiling on how long a save may sit unwritten while the main thread
 * stays busy.
 */
const IDLE_TIMEOUT_MS = 2000;

/**
 * How often the world is checked against the stored save, in seconds.
 * Short enough that quitting right after an action keeps it, long enough
 * that a body walking across the floor doesn't rewrite the slot every
 * frame.
 */
const CHECK_INTERVAL_SECONDS = 0.25;

export class SaveManager extends BaseEntity implements Entity {
  id = "saveManager";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  /** The JSON of the last snapshot written; null before the first write. */
  private lastWritten: string | null = null;
  /** True when a write is owed. */
  private dirty = false;
  /** Handle for the scheduled idle callback, or null when nothing is queued. */
  private handle: number | null = null;
  /** True when `handle` came from setTimeout rather than requestIdleCallback. */
  private usingTimeoutFallback = false;
  /** The engine tick the next comparison is due on. */
  private nextCheckTick = 0;

  constructor(private storage: SaveStorage) {
    super();
  }

  /** Compare the world against the stored save, and queue a write if it moved. */
  @on("afterTick")
  onAfterTick() {
    if (this.game.ticknumber < this.nextCheckTick) {
      return;
    }
    this.nextCheckTick =
      this.game.ticknumber +
      Math.max(
        1,
        Math.round(this.game.ticksPerSecond * CHECK_INTERVAL_SECONDS),
      );
    if (this.snapshot() !== null) {
      this.schedule();
    }
  }

  /**
   * Queue a save for the next idle moment. Calling this repeatedly before
   * the write happens is free — only one write runs, and it serializes
   * the world as it stands at write time.
   */
  schedule(): void {
    this.dirty = true;
    if (this.handle !== null) return;
    this.requestIdle(() => {
      this.handle = null;
      this.writePending();
    });
  }

  /**
   * Write the world immediately and synchronously if it differs from what
   * is stored. A no-op otherwise — that means the stored save already
   * describes the shop as it stands.
   */
  flush(): void {
    this.cancelIdle();
    // Look at the world regardless of what the last periodic check said:
    // the change being flushed may be younger than that check.
    this.dirty = true;
    this.writePending();
  }

  /** Drop any queued save without writing it. */
  cancel(): void {
    this.cancelIdle();
    this.dirty = false;
  }

  /**
   * The world as bytes worth storing, or null when there is nothing to
   * write: no shop in the world, a night in progress, or a snapshot
   * identical to the last one written.
   */
  private snapshot(): { file: SaveFile; json: string } | null {
    if (this.savesHeld()) {
      return null;
    }
    const file = serializeGame(this.game);
    if (missingRequiredSingletons(file).length > 0) {
      return null;
    }
    const json = JSON.stringify(file);
    return json === this.lastWritten ? null : { file, json };
  }

  /**
   * True while the world is mid-transaction and a snapshot would not
   * describe a shop any day begins or ends in. The overnight batch is the
   * one such stretch: it spans many engine ticks, and the day only turns
   * over when it finishes.
   */
  private savesHeld(): boolean {
    return (
      this.game.entities.tryGetSingleton(SleepSystem)?.overnightPending ?? false
    );
  }

  private writePending(): void {
    if (!this.dirty || !this.isAdded) {
      return;
    }
    const snapshot = this.snapshot();
    if (snapshot === null) {
      // Nothing to store. A held night keeps the write owed — the next
      // check after morning queues it again.
      this.dirty = this.savesHeld();
      return;
    }
    this.dirty = false;
    this.lastWritten = snapshot.json;
    this.storage.write(snapshot.file);
  }

  private requestIdle(callback: () => void): void {
    // Safari only grew requestIdleCallback recently (and Node never has),
    // so fall back to a macrotask, which still gets the write off the
    // current frame.
    const requestIdleCallback = (
      globalThis as {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback;
    if (typeof requestIdleCallback === "function") {
      this.usingTimeoutFallback = false;
      this.handle = requestIdleCallback(callback, {
        timeout: IDLE_TIMEOUT_MS,
      });
    } else {
      this.usingTimeoutFallback = true;
      this.handle = setTimeout(callback, 0) as unknown as number;
    }
  }

  private cancelIdle(): void {
    if (this.handle === null) return;
    if (this.usingTimeoutFallback) {
      clearTimeout(this.handle);
    } else {
      (
        globalThis as { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback?.(this.handle);
    }
    this.handle = null;
  }
}
