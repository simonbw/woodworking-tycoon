import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "../initialGameState";
import { clearPendingSoundsAction, emitSound } from "./sound-actions";

describe("sound-actions", () => {
  it("emitSound appends a cue, preserving existing ones", () => {
    const s1 = emitSound(initialGameState, {
      kind: "operation-complete",
      machineTypeId: "workspace",
    });
    assert.strictEqual(s1.pendingSounds?.length, 1);

    const s2 = emitSound(s1, {
      kind: "operation-complete",
      machineTypeId: "garbageCan",
    });
    assert.strictEqual(s2.pendingSounds?.length, 2);
    assert.strictEqual(s2.pendingSounds?.[1].machineTypeId, "garbageCan");
  });

  it("emitSound does not mutate the input state", () => {
    const before = initialGameState.pendingSounds?.length ?? 0;
    emitSound(initialGameState, { kind: "operation-complete" });
    assert.strictEqual(initialGameState.pendingSounds?.length ?? 0, before);
  });

  it("clearPendingSoundsAction empties a non-empty queue", () => {
    const withSound = emitSound(initialGameState, {
      kind: "operation-complete",
    });
    const cleared = clearPendingSoundsAction(withSound);
    assert.strictEqual(cleared.pendingSounds?.length, 0);
  });

  it("clearPendingSoundsAction returns the same state when already empty", () => {
    const cleared = clearPendingSoundsAction(initialGameState);
    assert.strictEqual(cleared, initialGameState);
  });
});
