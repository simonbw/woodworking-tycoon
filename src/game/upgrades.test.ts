import assert from "node:assert";
import { describe, it } from "node:test";
import { Machine, Operation, MachineState } from "./Machine";
import { initialGameState } from "./initialGameState";
import { getOperationPhases } from "./skill-helpers";
import { workspace } from "./machines/workspace";
import { worktable1x1, worktable1x2 } from "./machines/worktables";

/**
 * What an upgrade does to the station it's bolted to. Buying one,
 * installing it, and taking it back off are driven through the live
 * commands in `sim/commands/store-commands.test.ts` and
 * `sim/commands/tool-commands.test.ts`; a bench-built upgrade landing in
 * storage is `sim/commands/machine-commands.test.ts`.
 */

function tableAt(
  position: [number, number],
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    machineTypeId: "worktable1x1",
    position,
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "none",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
    storedMaterials: [],
    upgrades: [],
    ...overrides,
  };
}

describe("upgrade slots", () => {
  it("come with the worktables, one per foot of bench", () => {
    assert.strictEqual(worktable1x1.upgradeSlots, 1);
    assert.strictEqual(worktable1x2.upgradeSlots, 2);
    // The makeshift bench takes none — nothing to bolt an upgrade to
    assert.ok(!workspace.upgradeSlots);
  });
});

describe("upgrade effects on the Machine view", () => {
  it("vise multiplies work speed; drawers add slots; shelf adds spaces", () => {
    const bare = new Machine(tableAt([2, 2]));
    const kitted = new Machine(
      tableAt([2, 2], { upgrades: ["vise", "toolDrawers", "materialShelf"] }),
    );
    assert.strictEqual(bare.workSpeed, 1.25);
    assert.strictEqual(kitted.workSpeed, 1.25 * 1.25);
    assert.strictEqual(kitted.toolSlots, bare.toolSlots + 2);
    assert.strictEqual(kitted.materialStorage, bare.materialStorage + 4);
  });

  it("duplicate vises stack", () => {
    const doubled = new Machine(
      tableAt([2, 2], { upgrades: ["vise", "vise"] }),
    );
    assert.strictEqual(doubled.workSpeed, 1.25 * 1.25 * 1.25);
  });

  it("a vise-equipped table shortens attended phases further", () => {
    const glueUp = workspace.operations.find(
      (op) => op.id === "glueUpPanel",
    ) as Operation;
    const table = new Machine(tableAt([2, 2]));
    const vised = new Machine(tableAt([2, 2], { upgrades: ["vise"] }));
    const plain = getOperationPhases(
      glueUp,
      initialGameState.progression,
      1,
      table.workSpeed,
    );
    const fast = getOperationPhases(
      glueUp,
      initialGameState.progression,
      1,
      vised.workSpeed,
    );
    assert.ok(fast[0].duration < plain[0].duration);
    // The hands-free cure is untouched by workholding
    assert.strictEqual(fast[1].duration, plain[1].duration);
  });
});
