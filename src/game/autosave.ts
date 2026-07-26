import { GameState } from "./GameState";
import { saveGame } from "./saveLoad";

/**
 * Coalescing scheduler for autosaves.
 *
 * Writing the save is cheap — a full end-of-ledger shop is ~46 KB, which
 * stringifies and lands in localStorage in well under a tenth of a
 * millisecond, so saving on every tick would cost a rounding error of the
 * frame budget. What we avoid is not the cost but the *timing*: the write
 * is deferred to an idle moment so it never lands in the middle of a tick,
 * and repeated schedules collapse into one write. A burst of actions in a
 * single frame (or a fixture load) saves once, not five times.
 *
 * `localStorage` has no async API, and that is a feature here rather than
 * a limitation: when the tab is closing there is no async turn left, so
 * the synchronous write is the only one that reliably lands. See
 * `flushAutosave`.
 */

/** The most recent state handed to us, waiting to be written. */
let pending: GameState | null = null;
/** Handle for the scheduled idle callback, or null when nothing is queued. */
let handle: number | null = null;
/** True when `handle` came from setTimeout rather than requestIdleCallback. */
let usingTimeoutFallback = false;

/**
 * Ceiling on how long a save may sit unwritten while the main thread stays
 * busy. Two seconds of lost work is nothing in a shop that ticks five times
 * a second, but an unbounded idle wait could strand a save indefinitely.
 */
const IDLE_TIMEOUT_MS = 2000;

function requestIdle(callback: () => void): void {
  // Safari only grew requestIdleCallback recently, so fall back to a
  // macrotask, which still gets the write off the current frame.
  const requestIdleCallback = (
    globalThis as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;
  if (typeof requestIdleCallback === "function") {
    usingTimeoutFallback = false;
    handle = requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
  } else {
    usingTimeoutFallback = true;
    handle = setTimeout(callback, 0) as unknown as number;
  }
}

function cancelIdle(): void {
  if (handle === null) return;
  if (usingTimeoutFallback) {
    clearTimeout(handle);
  } else {
    (
      globalThis as { cancelIdleCallback?: (h: number) => void }
    ).cancelIdleCallback?.(handle);
  }
  handle = null;
}

/**
 * Queue `gameState` to be saved at the next idle moment. Calling this
 * repeatedly before the write happens is free — only the newest state is
 * kept, and only one write runs.
 */
export function scheduleAutosave(gameState: GameState): void {
  pending = gameState;
  if (handle !== null) return;
  requestIdle(() => {
    handle = null;
    writePending();
  });
}

/**
 * Write any queued save immediately and synchronously. This is what runs
 * when the tab is being hidden or closed, where a deferred write would
 * never happen. A no-op when nothing is queued — that means the newest
 * state is already on disk.
 */
export function flushAutosave(): void {
  cancelIdle();
  writePending();
}

/**
 * Drop any queued save without writing it. Used when the shop is torn down
 * by a deliberate quit, which has already saved: without this, a stale
 * write could land *after* "New Game" deleted the save and resurrect the
 * old shop.
 */
export function cancelAutosave(): void {
  cancelIdle();
  pending = null;
}

function writePending(): void {
  const gameState = pending;
  pending = null;
  if (gameState !== null) {
    saveGame(gameState);
  }
}
