import assert from "node:assert";
import { describe, it } from "node:test";
import { handToolsShop } from "../../../tests/fixtures/hand-tools-shop";
import { board } from "../../game/board-helpers";
import { GameState } from "../../game/GameState";
import { MachineState } from "../../game/Machine";
import { makePallet, makeToolItem } from "../../game/material-helpers";
import { MaterialInstance, ToolItem } from "../../game/Materials";
import { ToolId } from "../../game/Tool";
import { UpgradeId } from "../../game/Upgrade";
import { ShopDriver } from "../driver/ShopDriver";
import { pickUpMachine } from "./machine-commands";
import { dropMaterial } from "./pile-commands";
import { mountTool, unmountTool } from "./tool-commands";
import { installUpgrade, uninstallUpgrade } from "./upgrade-commands";

/**
 * The tools & upgrades port's contract: mounting moves a physical tool
 * item between the hands and a station's rack (adding and removing its
 * operations there), upgrades trade between the StorageUpgrades singleton
 * and a worktable's slots, and every refusal the old actions made — a
 * working station, a full rack, an incompatible machine, full hands,
 * stranded capacity — refuses the same way here.
 */

const IN_PROGRESS: MachineState["operationProgress"] = {
  status: "inProgress",
  phaseIndex: 0,
  ticksRemaining: 5,
};

/** A bare machine of the given kind, standing clear of everything else. */
function machineAt(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    machineTypeId,
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

/** A 2'×2' worktable standing clear of the fixture's workspace. */
function worktableAt(
  position: [number, number],
  overrides: Partial<MachineState> = {},
): MachineState {
  return machineAt("worktable1x1", position, overrides);
}

/**
 * The hand-tools fixture, restaged for the mount/unmount trade: the
 * workspace plus a worktable, with the loose tools and upgrades wherever
 * the test wants them resting.
 */
function toolShop(
  overrides: {
    inventory?: MaterialInstance[];
    piles?: MaterialInstance[];
    bed?: MaterialInstance[];
    workspace?: Partial<MachineState>;
    worktable?: Partial<MachineState>;
    extraMachines?: MachineState[];
    storageUpgrades?: UpgradeId[];
  } = {},
): GameState {
  return {
    ...handToolsShop,
    materialPiles: (overrides.piles ?? []).map((material) => ({
      material,
      position: [8.5, 8.5],
      rotation: 0,
    })),
    machines: [
      { ...handToolsShop.machines[0], ...overrides.workspace },
      worktableAt([6, 6], overrides.worktable),
      ...(overrides.extraMachines ?? []),
    ],
    truck: { bed: overrides.bed ?? [], crates: [] },
    storage: { upgrades: overrides.storageUpgrades ?? [] },
    player: {
      ...handToolsShop.player,
      inventory: overrides.inventory ?? [],
    },
  };
}

/** The one carried tool item of this kind — what a mount hands over. */
function carriedTool(shop: ShopDriver, toolId: ToolId): ToolItem {
  const found = shop.inventory.find(
    (item): item is ToolItem => item.type === "tool" && item.toolId === toolId,
  );
  assert.ok(found, `no ${toolId} in hand`);
  return found;
}

describe("mounting and unmounting tools", () => {
  it("mounts from the hands and adds the tool's operations", () => {
    const shop = new ShopDriver({
      state: toolShop({ inventory: [makeToolItem("sandingBlock")] }),
    });
    shop.mount("workspace", "sandingBlock");
    assert.deepStrictEqual(shop.machine("workspace").state.tools, [
      "sandingBlock",
    ]);
    assert.strictEqual(shop.inventory.length, 0);
    const operationIds = shop
      .machine("workspace")
      .view()
      .operations.map((op) => op.id);
    assert.ok(operationIds.includes("blockSandBoard"));
    assert.ok(operationIds.includes("dismantlePallet"));
  });

  it("unmounts into the hands, dropping the tool's operations and resetting the selection", () => {
    const shop = new ShopDriver({
      state: toolShop({
        workspace: {
          tools: ["sandingBlock"],
          selectedOperationId: "blockSandBoard",
        },
      }),
    });
    shop.unmount("workspace", "sandingBlock");
    assert.deepStrictEqual(shop.machine("workspace").state.tools, []);
    const held = carriedTool(shop, "sandingBlock");
    assert.strictEqual(held.type, "tool");
    const operationIds = shop
      .machine("workspace")
      .view()
      .operations.map((op) => op.id);
    assert.ok(!operationIds.includes("blockSandBoard"));
    // The selection falls back to an operation the station still has
    assert.strictEqual(
      shop.machine("workspace").state.selectedOperationId,
      "dismantlePallet",
    );
  });

  it("a loose tool rests on the floor as a material pile", () => {
    const shop = new ShopDriver({
      state: toolShop({ workspace: { tools: ["sandingBlock"] } }),
    });
    shop.unmount("workspace", "sandingBlock");
    const held = carriedTool(shop, "sandingBlock");
    assert.ok(dropMaterial(shop.game, [held]));
    assert.strictEqual(shop.inventory.length, 0);
    assert.strictEqual(shop.piles.length, 1);
    assert.strictEqual(shop.piles[0].material.type, "tool");
    // Mounting fetches it back off the floor
    shop.mount("workspace", "sandingBlock");
    assert.strictEqual(shop.piles.length, 0);
    assert.deepStrictEqual(shop.machine("workspace").state.tools, [
      "sandingBlock",
    ]);
  });

  it("lifts a tool out of the truck's bed to mount it", () => {
    const shop = new ShopDriver({
      state: toolShop({ bed: [makeToolItem("sandingBlock")] }),
    });
    shop.mount("workspace", "sandingBlock");
    assert.deepStrictEqual(shop.machine("workspace").state.tools, [
      "sandingBlock",
    ]);
    assert.strictEqual(shop.truck.bed.length, 0);
  });

  it("refuses to mount or unmount while the station is working", () => {
    const shop = new ShopDriver({
      state: toolShop({
        inventory: [makeToolItem("hammer")],
        workspace: {
          tools: ["sandingBlock"],
          operationProgress: IN_PROGRESS,
        },
      }),
    });
    const workspace = shop.machine("workspace");
    const hammer = carriedTool(shop, "hammer");
    assert.strictEqual(mountTool(shop.game, workspace, hammer), false);
    assert.deepStrictEqual(workspace.state.tools, ["sandingBlock"]);
    assert.strictEqual(shop.inventory.length, 1);
    assert.strictEqual(
      unmountTool(shop.game, workspace, "sandingBlock"),
      false,
    );
    assert.deepStrictEqual(workspace.state.tools, ["sandingBlock"]);
  });

  it("refuses a full rack (the workspace has two slots)", () => {
    const shop = new ShopDriver({
      state: toolShop({
        inventory: [makeToolItem("sandingBlock")],
        workspace: { tools: ["hammer", "handSaw"] },
      }),
    });
    const refused = mountTool(
      shop.game,
      shop.machine("workspace"),
      carriedTool(shop, "sandingBlock"),
    );
    assert.strictEqual(refused, false);
    assert.deepStrictEqual(shop.machine("workspace").state.tools, [
      "hammer",
      "handSaw",
    ]);
    assert.strictEqual(shop.inventory.length, 1);
  });

  it("refuses a tool that doesn't mount on this machine, and takes it on one that does", () => {
    // The dust bag's compatible list names dusty machines, not benches
    const shop = new ShopDriver({
      state: toolShop({
        inventory: [makeToolItem("dustBag")],
        extraMachines: [machineAt("lunchboxPlaner", [3, 10])],
      }),
    });
    const refused = mountTool(
      shop.game,
      shop.machine("workspace"),
      carriedTool(shop, "dustBag"),
    );
    assert.strictEqual(refused, false);
    assert.deepStrictEqual(shop.machine("workspace").state.tools, []);

    // The planer is on the list
    assert.ok(
      mountTool(
        shop.game,
        shop.machine("lunchboxPlaner"),
        carriedTool(shop, "dustBag"),
      ),
    );
    assert.deepStrictEqual(shop.machine("lunchboxPlaner").state.tools, [
      "dustBag",
    ]);
  });

  it("carries a station's mounted tools with it when the station is lifted", () => {
    const shop = new ShopDriver({
      state: toolShop({ workspace: { tools: ["sandingBlock"] } }),
    });
    assert.ok(pickUpMachine(shop.game, shop.machine("workspace")));
    assert.deepStrictEqual(shop.player.carriedMachine?.tools, ["sandingBlock"]);
  });

  it("refuses to mount a tool that isn't in the hands", () => {
    const shop = new ShopDriver({ state: toolShop() });
    const loose = makeToolItem("sandingBlock");
    assert.strictEqual(
      mountTool(shop.game, shop.machine("workspace"), loose),
      false,
    );
    assert.deepStrictEqual(shop.machine("workspace").state.tools, []);
  });

  it("refuses to unmount into full hands", () => {
    const shop = new ShopDriver({
      state: toolShop({
        inventory: [board(), board(), board(), board()],
        workspace: { tools: ["sandingBlock"] },
      }),
    });
    assert.strictEqual(
      unmountTool(shop.game, shop.machine("workspace"), "sandingBlock"),
      false,
    );
    assert.deepStrictEqual(shop.machine("workspace").state.tools, [
      "sandingBlock",
    ]);
    assert.strictEqual(shop.inventory.length, 4);
  });
});

describe("worktable upgrades", () => {
  it("installs from storage and folds into the station's stats", () => {
    const shop = new ShopDriver({
      state: toolShop({ storageUpgrades: ["vise"] }),
    });
    const table = shop.machine("worktable1x1");
    const bareSpeed = table.view().workSpeed;
    assert.ok(installUpgrade(shop.game, table, "vise"));
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, []);
    assert.deepStrictEqual(table.state.upgrades, ["vise"]);
    assert.strictEqual(table.view().workSpeed, bareSpeed * 1.25);
  });

  it("refuses when the slots are full or the upgrade isn't in storage", () => {
    const shop = new ShopDriver({
      state: toolShop({ storageUpgrades: ["vise", "toolDrawers"] }),
    });
    const table = shop.machine("worktable1x1");
    assert.ok(installUpgrade(shop.game, table, "vise"));
    // The small worktable has a single upgrade slot
    assert.strictEqual(installUpgrade(shop.game, table, "toolDrawers"), false);
    assert.deepStrictEqual(table.state.upgrades, ["vise"]);
    // materialShelf was never bought or built
    assert.strictEqual(
      installUpgrade(shop.game, table, "materialShelf"),
      false,
    );
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["toolDrawers"]);
  });

  it("refuses to install on a station without upgrade slots", () => {
    const shop = new ShopDriver({
      state: toolShop({ storageUpgrades: ["vise"] }),
    });
    assert.strictEqual(
      installUpgrade(shop.game, shop.machine("workspace"), "vise"),
      false,
    );
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["vise"]);
  });

  it("uninstalls back into storage", () => {
    const shop = new ShopDriver({
      state: toolShop({ worktable: { upgrades: ["vise"] } }),
    });
    const table = shop.machine("worktable1x1");
    assert.ok(uninstallUpgrade(shop.game, table, "vise"));
    assert.deepStrictEqual(table.state.upgrades, []);
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["vise"]);
  });

  it("won't strand mounted tools or shelved stock past the reduced capacity", () => {
    // 3 base tool slots + 2 from the drawers, 4 mounted: fine with the
    // drawers, one too many without them
    const shop = new ShopDriver({
      state: toolShop({
        worktable: {
          upgrades: ["toolDrawers"],
          tools: ["hammer", "sandingBlock", "handPlane", "handSaw"],
        },
      }),
    });
    const table = shop.machine("worktable1x1");
    assert.strictEqual(
      uninstallUpgrade(shop.game, table, "toolDrawers"),
      false,
    );
    assert.deepStrictEqual(table.state.upgrades, ["toolDrawers"]);

    // 3 base shelf spaces + 4 from the shelf, 4 parked: same story
    const shelved = new ShopDriver({
      state: toolShop({
        worktable: {
          upgrades: ["materialShelf"],
          storedMaterials: [board(), board(), board(), board()],
        },
      }),
    });
    const shelfTable = shelved.machine("worktable1x1");
    assert.strictEqual(
      uninstallUpgrade(shelved.game, shelfTable, "materialShelf"),
      false,
    );
    assert.deepStrictEqual(shelfTable.state.upgrades, ["materialShelf"]);
  });

  it("refuses to install or uninstall while the station is working", () => {
    const shop = new ShopDriver({
      state: toolShop({
        storageUpgrades: ["vise"],
        worktable: { upgrades: ["vise"], operationProgress: IN_PROGRESS },
      }),
    });
    const table = shop.machine("worktable1x1");
    assert.strictEqual(installUpgrade(shop.game, table, "vise"), false);
    assert.strictEqual(uninstallUpgrade(shop.game, table, "vise"), false);
    assert.deepStrictEqual(table.state.upgrades, ["vise"]);
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["vise"]);
  });
});

describe("driver verbs", () => {
  it("fitOut swaps the rack to exactly the named tools", () => {
    const shop = new ShopDriver({
      state: toolShop({
        inventory: [makeToolItem("sandingBlock")],
        workspace: { tools: ["hammer"] },
      }),
    });
    shop.fitOut("workspace", ["sandingBlock"]);
    assert.deepStrictEqual(shop.machine("workspace").state.tools, [
      "sandingBlock",
    ]);
    // The hammer came off as a physical thing, still in reach
    const looseHammers = shop.stock(
      (m) => m.type === "tool" && m.toolId === "hammer",
    );
    assert.strictEqual(looseHammers.length, 1);
  });

  it("canOperate answers for what's staged on the station", () => {
    const empty = new ShopDriver({ state: toolShop() });
    assert.strictEqual(empty.canOperate("workspace"), false);
    const staged = new ShopDriver({
      state: toolShop({ workspace: { inputMaterials: [makePallet()] } }),
    });
    assert.strictEqual(staged.canOperate("workspace"), true);
  });

  it("mount fails loudly when no loose tool exists anywhere", () => {
    const shop = new ShopDriver({ state: toolShop() });
    assert.throws(
      () => shop.mount("workspace", "sandingBlock"),
      /No loose sandingBlock anywhere/,
    );
  });
});

describe("save round-trip", () => {
  it("round-trips a mounted tool and an installed upgrade byte-identically", () => {
    const shop = new ShopDriver({
      state: toolShop({
        inventory: [makeToolItem("sandingBlock")],
        storageUpgrades: ["vise", "toolDrawers"],
      }),
    });
    shop.mount("workspace", "sandingBlock");
    assert.ok(installUpgrade(shop.game, shop.machine("worktable1x1"), "vise"));

    const save = shop.save();
    const reloaded = new ShopDriver({ save });
    assert.deepStrictEqual(reloaded.machine("workspace").state.tools, [
      "sandingBlock",
    ]);
    assert.deepStrictEqual(reloaded.machine("worktable1x1").state.upgrades, [
      "vise",
    ]);
    assert.deepStrictEqual(reloaded.storageUpgrades.upgrades, ["toolDrawers"]);
    assert.strictEqual(
      JSON.stringify(new ShopDriver({ save }).save()),
      JSON.stringify(save),
    );
  });
});
