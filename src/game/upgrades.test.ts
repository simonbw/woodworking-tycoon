import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { GameState } from "./GameState";
import { Machine, MachineOperation, MachineState } from "./Machine";
import { initialGameState } from "./initialGameState";
import {
  buyUpgradeAction,
  installUpgradeAction,
  uninstallUpgradeAction,
} from "./game-actions/upgrade-actions";
import { tickAction } from "./game-actions/tickAction";
import { getOperationPhases } from "./skill-helpers";
import { workspace } from "./machines/workspace";
import { worktable1x1, worktable1x2 } from "./machines/worktables";

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

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

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
    ) as MachineOperation;
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

describe("buy / install / uninstall", () => {
  it("buying a vise moves money into upgrade storage", () => {
    const state = stateWith({ money: 100 });
    const result = buyUpgradeAction("vise")(state);
    assert.strictEqual(result.money, 20);
    assert.deepStrictEqual(result.storage.upgrades, ["vise"]);
    // Can't afford a second
    assert.strictEqual(buyUpgradeAction("vise")(result), result);
  });

  it("installs from storage into a free slot, refuses when full", () => {
    const table = tableAt([2, 2]);
    const state = stateWith({
      machines: [table],
      storage: {
        ...initialGameState.storage,
        upgrades: ["vise", "toolDrawers"],
      },
    });
    const view = new Machine(table);
    const installed = installUpgradeAction(view, "vise")(state);
    assert.deepStrictEqual(installed.machines[0].upgrades, ["vise"]);
    assert.deepStrictEqual(installed.storage.upgrades, ["toolDrawers"]);

    // worktable1x1 has a single upgrade slot
    assert.strictEqual(worktable1x1.upgradeSlots, 1);
    const full = installUpgradeAction(
      new Machine(installed.machines[0]),
      "toolDrawers",
    )(installed);
    assert.strictEqual(full, installed);
  });

  it("refuses to install on a station without upgrade slots", () => {
    const bench = tableAt([1, 2], { machineTypeId: "workspace" });
    const state = stateWith({
      machines: [bench],
      storage: { ...initialGameState.storage, upgrades: ["vise"] },
    });
    assert.strictEqual(
      installUpgradeAction(new Machine(bench), "vise")(state),
      state,
    );
  });

  it("uninstall returns the upgrade to storage", () => {
    const table = tableAt([2, 2], { upgrades: ["vise"] });
    const state = stateWith({ machines: [table] });
    const result = uninstallUpgradeAction(new Machine(table), "vise")(state);
    assert.deepStrictEqual(result.machines[0].upgrades, []);
    assert.deepStrictEqual(result.storage.upgrades, ["vise"]);
  });

  it("won't strand tools or shelf stock past the reduced capacity", () => {
    // 1x2 table: 4 base tool slots, 6 base shelf spaces, 2 upgrade slots
    assert.strictEqual(worktable1x2.upgradeSlots, 2);
    const overloaded = tableAt([2, 2], {
      machineTypeId: "worktable1x2",
      upgrades: ["toolDrawers", "materialShelf"],
      tools: [
        "hammer",
        "sandingBlock",
        "handPlane",
        "randomOrbitSander",
        "dustBag",
      ],
      storedMaterials: Array.from({ length: 8 }, () => board("maple", 2, 2, 4)),
    });
    const state = stateWith({ machines: [overloaded] });
    const view = new Machine(overloaded);
    // 5 tools mounted > 4 slots without drawers; 8 stored > 6 without shelf
    assert.strictEqual(
      uninstallUpgradeAction(view, "toolDrawers")(state),
      state,
    );
    assert.strictEqual(
      uninstallUpgradeAction(view, "materialShelf")(state),
      state,
    );
  });
});

describe("shop-built upgrades", () => {
  it("bench recipes deliver drawers and shelves to upgrade storage", () => {
    const bench = tableAt([1, 2], {
      machineTypeId: "workspace",
      selectedOperationId: "buildMaterialShelf",
      processingMaterials: [board("pallet", 3, 4, 1), board("pallet", 3, 4, 1)],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const state = stateWith({
      machines: [bench],
      player: { ...initialGameState.player, position: [1, 3] },
    });
    const result = tickAction(state);
    assert.deepStrictEqual(result.storage.upgrades, ["materialShelf"]);
  });
});
