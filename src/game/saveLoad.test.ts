import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { TEST_FIXTURES } from "../../tests/fixtures";
import { parseGameState } from "./gameStateSchema";
import { initialGameState } from "./initialGameState";
import { deleteSave, hasSavedGame, loadGame, saveGame } from "./saveLoad";

// node:test has no DOM; back localStorage with a Map for the round-trip.
const backing = new Map<string, string>();
const storage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => void backing.set(key, value),
  removeItem: (key: string) => void backing.delete(key),
};
(globalThis as { localStorage?: unknown }).localStorage = storage;

const SAVE_KEY = "woodworking-tycoon-save";

beforeEach(() => {
  // Re-claim the global before clearing it. The whole unit suite shares one
  // process and audioSettings.test.ts installs a stub of its own at import
  // time, so without this the clear would empty a map that nothing is
  // reading from and saves would leak between tests.
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  backing.clear();
});

describe("saveGame/loadGame round-trip", () => {
  it("loads back what was saved, with fresh presentation queues", () => {
    const state = {
      ...initialGameState,
      money: 123.45,
      pendingSounds: [{ kind: "sale" as const }],
      pendingPayouts: [
        {
          id: "payout-test",
          kind: "commission" as const,
          title: "Your First Shelf",
          money: 200,
          reputation: 2,
          xp: 40,
        },
      ],
    };
    saveGame(state);
    const loaded = loadGame();
    assert.ok(loaded);
    // Both transient queues are stripped on save and reconstructed empty —
    // a reload must not replay the last cha-ching.
    assert.deepStrictEqual(loaded.pendingSounds, []);
    assert.deepStrictEqual(loaded.pendingPayouts, []);
    const { pendingSounds: _a, pendingPayouts: _c, ...savedRest } = state;
    const { pendingSounds: _b, pendingPayouts: _d, ...loadedRest } = loaded;
    // JSON round-trips drop keys whose value is undefined; normalize the
    // expectation the same way before comparing.
    assert.deepStrictEqual(loadedRest, JSON.parse(JSON.stringify(savedRest)));
  });

  it("round-trips every E2E fixture", () => {
    for (const [name, fixture] of Object.entries(TEST_FIXTURES)) {
      saveGame(fixture);
      assert.ok(loadGame(), `fixture "${name}" failed to round-trip`);
    }
  });

  it("hasSavedGame/deleteSave reflect the stored save", () => {
    assert.strictEqual(hasSavedGame(), false);
    saveGame(initialGameState);
    assert.strictEqual(hasSavedGame(), true);
    deleteSave();
    assert.strictEqual(hasSavedGame(), false);
  });
});

describe("loadGame rejection", () => {
  it("returns null with no save present", () => {
    assert.strictEqual(loadGame(), null);
  });

  it("discards a save from another version", () => {
    saveGame(initialGameState);
    const raw = JSON.parse(backing.get(SAVE_KEY)!);
    raw.version = raw.version + 1;
    backing.set(SAVE_KEY, JSON.stringify(raw));
    assert.strictEqual(loadGame(), null);
    assert.strictEqual(hasSavedGame(), false);
  });

  it("discards unparseable JSON", () => {
    backing.set(SAVE_KEY, "{not json");
    assert.strictEqual(loadGame(), null);
    assert.strictEqual(hasSavedGame(), false);
  });

  it("discards a save that fails the schema", () => {
    saveGame(initialGameState);
    const raw = JSON.parse(backing.get(SAVE_KEY)!);
    delete raw.gameState.machines;
    backing.set(SAVE_KEY, JSON.stringify(raw));
    assert.strictEqual(loadGame(), null);
    assert.strictEqual(hasSavedGame(), false);
  });
});

describe("parseGameState", () => {
  it("accepts the initial game state", () => {
    assert.ok(parseGameState(JSON.parse(JSON.stringify(initialGameState))));
  });

  it("rejects a machine with an unknown type id", () => {
    const state = JSON.parse(JSON.stringify(initialGameState));
    state.machines = [
      {
        machineTypeId: "notARealMachine",
        position: [0, 0],
        rotation: 0,
        selectedOperationId: "none",
        operationProgress: {
          status: "notStarted",
          phaseIndex: 0,
          ticksRemaining: 0,
        },
        inputMaterials: [],
        processingMaterials: [],
        outputMaterials: [],
        tools: [],
      },
    ];
    assert.strictEqual(parseGameState(state), null);
  });

  it("rejects a progression slice missing its flags", () => {
    const state = JSON.parse(JSON.stringify(initialGameState));
    delete state.progression.xp;
    assert.strictEqual(parseGameState(state), null);
  });
});
