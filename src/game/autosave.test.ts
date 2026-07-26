import assert from "node:assert";
import { describe, it } from "node:test";
import { cancelAutosave, flushAutosave, scheduleAutosave } from "./autosave";
import { initialGameState } from "./initialGameState";
import { loadGame } from "./saveLoad";

// node:test has no DOM; back localStorage with a Map and count the writes,
// since coalescing is the thing worth asserting on.
const backing = new Map<string, string>();
let writes = 0;
const storage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => {
    writes++;
    backing.set(key, value);
  },
  removeItem: (key: string) => void backing.delete(key),
};

const idleQueue = new Map<number, () => void>();
let nextHandle = 1;

/** Run everything `scheduleAutosave` has queued, in place. */
function runIdleCallbacks(): void {
  const pending = [...idleQueue.values()];
  idleQueue.clear();
  for (const callback of pending) callback();
}

interface StubbedGlobals {
  localStorage?: unknown;
  requestIdleCallback?: unknown;
  cancelIdleCallback?: unknown;
}

/**
 * Wraps a test body with its own storage and a hand-driven idle queue.
 *
 * Two things force this shape. The unit suite runs with
 * `--experimental-test-isolation=none`, so every file's top-level
 * `beforeEach` lands in one shared root suite — saveLoad.test.ts and
 * audioSettings.test.ts each install a `localStorage` of their own, and
 * whichever registered last wins. Claiming the global inside the body
 * instead means nothing can run between the claim and the assertions.
 *
 * For the same reason every body here is synchronous: awaiting a real idle
 * callback would yield to another file mid-test. Driving the queue by hand
 * is deterministic anyway, which beats sleeping on a timer.
 */
function withStorage(body: () => void): () => void {
  return () => {
    const globals = globalThis as StubbedGlobals;
    const realRequestIdle = globals.requestIdleCallback;
    const realCancelIdle = globals.cancelIdleCallback;

    globals.localStorage = storage;
    globals.requestIdleCallback = (cb: () => void) => {
      const handle = nextHandle++;
      idleQueue.set(handle, cb);
      return handle;
    };
    globals.cancelIdleCallback = (handle: number) =>
      void idleQueue.delete(handle);

    backing.clear();
    writes = 0;
    idleQueue.clear();
    cancelAutosave();

    try {
      body();
    } finally {
      cancelAutosave();
      // Don't leave a fake scheduler installed for other files' tests.
      globals.requestIdleCallback = realRequestIdle;
      globals.cancelIdleCallback = realCancelIdle;
    }
  };
}

describe("scheduleAutosave", () => {
  it(
    "defers the write instead of doing it on the calling frame",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 77 });
      assert.strictEqual(writes, 0);

      runIdleCallbacks();
      assert.strictEqual(writes, 1);
      assert.strictEqual(loadGame()?.money, 77);
    }),
  );

  it(
    "collapses a burst of schedules into a single write",
    withStorage(() => {
      for (let i = 0; i < 20; i++) {
        scheduleAutosave({ ...initialGameState, money: i });
      }
      assert.strictEqual(idleQueue.size, 1, "should only queue one callback");

      runIdleCallbacks();
      assert.strictEqual(writes, 1);
    }),
  );

  it(
    "keeps the newest state when schedules pile up",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 1 });
      scheduleAutosave({ ...initialGameState, money: 2 });
      scheduleAutosave({ ...initialGameState, money: 3 });
      runIdleCallbacks();

      assert.strictEqual(loadGame()?.money, 3);
    }),
  );

  it(
    "writes again after the queue has drained",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 1 });
      runIdleCallbacks();
      scheduleAutosave({ ...initialGameState, money: 2 });
      runIdleCallbacks();

      assert.strictEqual(writes, 2);
      assert.strictEqual(loadGame()?.money, 2);
    }),
  );

  it(
    "bounds how long a save may sit unwritten",
    withStorage(() => {
      const timeouts: Array<number | undefined> = [];
      (globalThis as StubbedGlobals).requestIdleCallback = (
        cb: () => void,
        opts?: { timeout: number },
      ) => {
        timeouts.push(opts?.timeout);
        const handle = nextHandle++;
        idleQueue.set(handle, cb);
        return handle;
      };

      scheduleAutosave(initialGameState);
      assert.deepStrictEqual(timeouts, [2000]);
    }),
  );

  it(
    "strips the transient presentation queues",
    withStorage(() => {
      scheduleAutosave({
        ...initialGameState,
        pendingSounds: [{ kind: "sale" as const }],
      });
      runIdleCallbacks();

      assert.deepStrictEqual(loadGame()?.pendingSounds, []);
    }),
  );

  it(
    "falls back to a macrotask when there's no requestIdleCallback",
    withStorage(() => {
      delete (globalThis as StubbedGlobals).requestIdleCallback;

      const realSetTimeout = globalThis.setTimeout;
      let deferred: (() => void) | null = null;
      (globalThis as { setTimeout: unknown }).setTimeout = (cb: () => void) => {
        deferred = cb;
        return 1;
      };

      try {
        scheduleAutosave({ ...initialGameState, money: 12 });
        assert.notStrictEqual(deferred, null, "should have deferred the write");
        assert.strictEqual(writes, 0);

        deferred!();
        assert.strictEqual(writes, 1);
        assert.strictEqual(loadGame()?.money, 12);
      } finally {
        (globalThis as { setTimeout: unknown }).setTimeout = realSetTimeout;
      }
    }),
  );
});

describe("flushAutosave", () => {
  it(
    "writes synchronously, without waiting for idle",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 42 });
      flushAutosave();

      // This is the closing-tab path: there is no later turn to write in.
      assert.strictEqual(writes, 1);
      assert.strictEqual(loadGame()?.money, 42);
    }),
  );

  it(
    "does not double-write the save it flushed",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 42 });
      flushAutosave();
      runIdleCallbacks();

      assert.strictEqual(writes, 1);
    }),
  );

  it(
    "is a no-op when nothing is queued",
    withStorage(() => {
      flushAutosave();

      assert.strictEqual(writes, 0);
    }),
  );
});

describe("cancelAutosave", () => {
  it(
    "drops a queued save so it can't outlive the shop",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 99 });
      cancelAutosave();
      runIdleCallbacks();

      assert.strictEqual(writes, 0);
      assert.strictEqual(loadGame(), null);
    }),
  );

  it(
    "leaves a later schedule working",
    withStorage(() => {
      scheduleAutosave({ ...initialGameState, money: 99 });
      cancelAutosave();
      scheduleAutosave({ ...initialGameState, money: 5 });
      runIdleCallbacks();

      assert.strictEqual(writes, 1);
      assert.strictEqual(loadGame()?.money, 5);
    }),
  );
});
