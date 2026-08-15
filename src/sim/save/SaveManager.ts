import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { SaveFile, serializeGame } from "./SaveFile";

/**
 * The autosave scheduler, rehosted from `src/game/autosave.ts` as an
 * entity.
 *
 * Writing the save is cheap; what we avoid is the *timing*. `schedule()`
 * marks the world dirty and defers the write to an idle moment, so it
 * never lands in the middle of a tick and a burst of schedules collapses
 * into one write. Because JavaScript is single-threaded and ticks run
 * synchronously, the idle callback always fires between ticks — the
 * snapshot sits on a tick boundary by construction.
 *
 * The synchronous escape hatches survive the move: `flush()` writes a
 * dirty world immediately (the shell wires this to `pagehide`, where no
 * async turn is left), and `cancel()` drops a pending write so a
 * deliberate quit can't resurrect a deleted save.
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

export class SaveManager extends BaseEntity implements Entity {
  id = "saveManager";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  /** True when a write is owed. */
  private dirty = false;
  /** Handle for the scheduled idle callback, or null when nothing is queued. */
  private handle: number | null = null;
  /** True when `handle` came from setTimeout rather than requestIdleCallback. */
  private usingTimeoutFallback = false;

  constructor(private storage: SaveStorage) {
    super();
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
   * Write any queued save immediately and synchronously. A no-op when
   * nothing is queued — that means the newest state is already stored.
   */
  flush(): void {
    this.cancelIdle();
    this.writePending();
  }

  /** Drop any queued save without writing it. */
  cancel(): void {
    this.cancelIdle();
    this.dirty = false;
  }

  private writePending(): void {
    if (!this.dirty || !this.isAdded) {
      return;
    }
    this.dirty = false;
    this.storage.write(serializeGame(this.game));
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
