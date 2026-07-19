import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "../initialGameState";
import { makePallet } from "../material-helpers";
import { dropMaterialAction, pickUpMaterialAction } from "./player-actions";
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

describe("material movement sound cues", () => {
  it("pickUpMaterialAction emits a pickup cue", () => {
    const pile = {
      material: makePallet(),
      position: [0, 0] as [number, number],
    };
    const state = {
      ...initialGameState,
      materialPiles: [pile],
      player: {
        ...initialGameState.player,
        position: [0, 0] as [number, number],
      },
    };
    const result = pickUpMaterialAction([pile])(state);
    assert.deepStrictEqual(result.pendingSounds, [{ kind: "material-pickup" }]);
  });

  it("dropMaterialAction emits a drop cue", () => {
    const material = makePallet();
    const state = {
      ...initialGameState,
      player: { ...initialGameState.player, inventory: [material] },
    };
    const result = dropMaterialAction([material])(state);
    assert.deepStrictEqual(result.pendingSounds, [{ kind: "material-drop" }]);
  });

  it("emits no cue when a pickup is rejected", () => {
    const pile = {
      material: makePallet(),
      position: [3, 3] as [number, number],
    };
    const state = {
      ...initialGameState,
      materialPiles: [pile],
      player: {
        ...initialGameState.player,
        position: [0, 0] as [number, number],
      },
    };
    const result = pickUpMaterialAction([pile])(state);
    assert.strictEqual(result.pendingSounds?.length, 0);
  });
});
