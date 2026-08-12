import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { getMachines, Machine, MachineState } from "../Machine";
import { makeToolItem } from "../material-helpers";
import { ToolItem } from "../Materials";
import { ToolId } from "../Tool";
import { initialGameState } from "../initialGameState";
import {
  buyToolAction,
  gatherBenchToolAction,
  mountToolAction,
  unmountToolAction,
} from "./tool-actions";
import { freshMachineState, pickUpMachineAction } from "./machine-actions";

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

/**
 * A state with the given tools carried in the arms and mounted on the
 * first machine — the two places the mount/unmount trade happens between.
 */
function toolState(
  gameState: GameState,
  carriedTools: ToolId[],
  machineTools: ToolId[] = [],
): GameState {
  return {
    ...gameState,
    player: {
      ...gameState.player,
      inventory: [
        ...gameState.player.inventory,
        ...carriedTools.map(makeToolItem),
      ],
    },
    machines: gameState.machines.map((machine, index) =>
      index === 0 ? { ...machine, tools: machineTools } : machine,
    ),
  };
}

/** The first carried tool item — what a rack's Attach button hands over. */
function carriedTool(gameState: GameState, toolId: ToolId): ToolItem {
  const found = gameState.player.inventory.find(
    (item): item is ToolItem => item.type === "tool" && item.toolId === toolId,
  );
  assert.ok(found, `no ${toolId} in hand`);
  return found;
}

/** The fixture workspace as a Machine view over the given state. */
function workspaceOf(gameState: GameState): Machine {
  return getMachines(gameState.machines)[0];
}

describe("buyToolAction", () => {
  it("deducts the cost and lands the tool in the truck's bed", () => {
    const result = buyToolAction("sandingBlock")(stateWith({ money: 50 }));
    assert.strictEqual(result.money, 40);
    assert.strictEqual(result.truck.bed.length, 1);
    const bought = result.truck.bed[0];
    assert.strictEqual(bought.type, "tool");
    assert.strictEqual((bought as ToolItem).toolId, "sandingBlock");
  });

  it("does nothing when the player cannot afford it", () => {
    const state = stateWith({ money: 5 });
    const result = buyToolAction("randomOrbitSander")(state);
    assert.strictEqual(result, state);
  });
});

describe("mountToolAction", () => {
  it("moves the tool from the hands into the station's slots", () => {
    const state = toolState(initialGameState, ["sandingBlock"]);
    const tool = carriedTool(state, "sandingBlock");
    const result = mountToolAction(workspaceOf(state), tool)(state);
    assert.ok(!result.player.inventory.includes(tool));
    assert.deepStrictEqual(result.machines[0].tools, ["sandingBlock"]);
  });

  it("makes the tool's operations available on the station", () => {
    const state = toolState(initialGameState, ["sandingBlock"]);
    const tool = carriedTool(state, "sandingBlock");
    const result = mountToolAction(workspaceOf(state), tool)(state);
    const operationIds = workspaceOf(result).operations.map((op) => op.id);
    assert.ok(operationIds.includes("blockSandBoard"));
    assert.ok(operationIds.includes("dismantlePallet"));
  });

  it("refuses when all slots are full (workspace has 2)", () => {
    const state = toolState(
      initialGameState,
      ["randomOrbitSander"],
      ["hammer", "sandingBlock"],
    );
    const tool = carriedTool(state, "randomOrbitSander");
    const result = mountToolAction(workspaceOf(state), tool)(state);
    assert.strictEqual(result, state);
  });

  it("refuses when the tool is not in the player's hands", () => {
    const state = toolState(initialGameState, []);
    const looseTool = makeToolItem("sandingBlock");
    const result = mountToolAction(workspaceOf(state), looseTool)(state);
    assert.strictEqual(result, state);
  });

  it("mounts a dust bag on a dusty machine but not the workspace", () => {
    const planer: MachineState = {
      machineTypeId: "lunchboxPlaner",
      position: [1, 4],
      rotation: 0,
      selectedOperationId: "plane",
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      tools: [],
    };
    const state = toolState(
      stateWith({ machines: [...initialGameState.machines, planer] }),
      ["dustBag"],
    );
    const tool = carriedTool(state, "dustBag");
    // The workspace isn't on the bag's compatible list
    const refused = mountToolAction(workspaceOf(state), tool)(state);
    assert.strictEqual(refused, state);
    // The planer is
    const planerView = getMachines(state.machines).find(
      (machine) => machine.type.id === "lunchboxPlaner",
    )!;
    const mounted = mountToolAction(planerView, tool)(state);
    assert.deepStrictEqual(
      mounted.machines[mounted.machines.length - 1].tools,
      ["dustBag"],
    );
  });
});

describe("mountToolAction refuses while the station is mid-operation", () => {
  it("leaves the tool in the hands", () => {
    const base = toolState(initialGameState, ["sandingBlock"]);
    const state: GameState = {
      ...base,
      machines: base.machines.map((machine, index) =>
        index === 0
          ? ({
              ...machine,
              operationProgress: {
                status: "inProgress",
                phaseIndex: 0,
                ticksRemaining: 5,
              },
            } as MachineState)
          : machine,
      ),
    };
    const tool = carriedTool(state, "sandingBlock");
    const result = mountToolAction(workspaceOf(state), tool)(state);
    assert.strictEqual(result, state);
  });
});

describe("unmountToolAction", () => {
  it("puts the tool into the player's hands", () => {
    const state = toolState(initialGameState, [], ["sandingBlock"]);
    const result = unmountToolAction(workspaceOf(state), "sandingBlock")(state);
    assert.deepStrictEqual(result.machines[0].tools, []);
    const held = carriedTool(result, "sandingBlock");
    assert.strictEqual(held.type, "tool");
  });

  it("refuses when the hands are full", () => {
    const base = toolState(initialGameState, [], ["sandingBlock"]);
    const state: GameState = {
      ...base,
      player: {
        ...base.player,
        // A full armload of stock leaves no room for the tool
        inventory: ["a", "b", "c", "d"].map((id) => ({
          id,
          type: "unknown",
        })),
      },
    };
    const result = unmountToolAction(workspaceOf(state), "sandingBlock")(state);
    assert.strictEqual(result, state);
  });

  it("resets the selected operation if it belonged to the removed tool", () => {
    const base = toolState(initialGameState, [], ["sandingBlock"]);
    const state: GameState = {
      ...base,
      machines: base.machines.map((machine, index) =>
        index === 0
          ? { ...machine, selectedOperationId: "blockSandBoard" }
          : machine,
      ),
    };
    const result = unmountToolAction(workspaceOf(state), "sandingBlock")(state);
    assert.strictEqual(
      result.machines[0].selectedOperationId,
      "dismantlePallet",
    );
  });

  it("refuses while the station is mid-operation", () => {
    const base = toolState(initialGameState, [], ["sandingBlock"]);
    const state: GameState = {
      ...base,
      machines: base.machines.map((machine, index) =>
        index === 0
          ? ({
              ...machine,
              operationProgress: {
                status: "inProgress",
                phaseIndex: 0,
                ticksRemaining: 5,
              },
            } as MachineState)
          : machine,
      ),
    };
    const result = unmountToolAction(workspaceOf(state), "sandingBlock")(state);
    assert.strictEqual(result, state);
  });
});

describe("gatherBenchToolAction", () => {
  // A run of two tables pushed edge to edge, plus a third standing alone
  // across the shop. The hammer hangs on the small table in the run.
  function runState(
    overrides: {
      targetTools?: ToolId[];
      targetProgress?: MachineState["operationProgress"];
    } = {},
  ): GameState {
    const target: MachineState = {
      ...freshMachineState("worktable1x2", initialGameState.progression),
      position: [1, 1],
      tools: overrides.targetTools ?? [],
      operationProgress:
        overrides.targetProgress ??
        freshMachineState("worktable1x2", initialGameState.progression)
          .operationProgress,
    };
    const neighbour: MachineState = {
      ...freshMachineState("worktable1x1", initialGameState.progression),
      position: [5, 1],
      tools: ["hammer"],
    };
    const stray: MachineState = {
      ...freshMachineState("worktable1x1", initialGameState.progression),
      position: [10, 10],
      tools: ["sandingBlock"],
    };
    return stateWith({ machines: [target, neighbour, stray] });
  }

  function targetOf(gameState: GameState): Machine {
    return getMachines(gameState.machines)[0];
  }

  it("slides the tool from the neighbouring table onto this one", () => {
    const state = runState();
    const result = gatherBenchToolAction(targetOf(state), "hammer")(state);
    assert.deepStrictEqual(result.machines[0].tools, ["hammer"]);
    assert.deepStrictEqual(result.machines[1].tools, []);
  });

  it("leaves a tool on a table outside the run where it hangs", () => {
    const state = runState();
    const result = gatherBenchToolAction(
      targetOf(state),
      "sandingBlock",
    )(state);
    assert.strictEqual(result, state);
    assert.deepStrictEqual(result.machines[2].tools, ["sandingBlock"]);
  });

  it("refuses when this table's rack is full", () => {
    // The full-size table has four slots
    const state = runState({
      targetTools: ["sandingBlock", "handSaw", "drill", "handPlane"],
    });
    const result = gatherBenchToolAction(targetOf(state), "hammer")(state);
    assert.strictEqual(result, state);
  });

  it("refuses while this table is mid-operation", () => {
    const state = runState({
      targetProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 5,
      },
    });
    const result = gatherBenchToolAction(targetOf(state), "hammer")(state);
    assert.strictEqual(result, state);
  });
});

describe("pickUpMachineAction", () => {
  it("keeps mounted tools with the carried machine", () => {
    const state = toolState(initialGameState, [], ["sandingBlock"]);
    const result = pickUpMachineAction(state.machines[0])(state);
    assert.deepStrictEqual(result.player.carriedMachine?.tools, [
      "sandingBlock",
    ]);
  });
});
