import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { getMachines, Machine, MachineState } from "../Machine";
import { ToolId } from "../Tool";
import { initialGameState } from "../initialGameState";
import {
  buyToolAction,
  mountToolAction,
  unmountToolAction,
} from "./tool-actions";
import { pickUpMachineAction } from "./machine-actions";

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

function toolState(
  gameState: GameState,
  storedTools: ToolId[],
  machineTools: ToolId[] = [],
): GameState {
  return {
    ...gameState,
    storage: { ...gameState.storage, tools: storedTools },
    machines: gameState.machines.map((machine, index) =>
      index === 0 ? { ...machine, tools: machineTools } : machine,
    ),
  };
}

/** The fixture workspace as a Machine view over the given state. */
function workspaceOf(gameState: GameState): Machine {
  return getMachines(gameState.machines)[0];
}

describe("buyToolAction", () => {
  it("deducts the cost and stores the tool", () => {
    const result = buyToolAction("sandingBlock")(stateWith({ money: 50 }));
    assert.strictEqual(result.money, 40);
    assert.deepStrictEqual(result.storage.tools, ["sandingBlock"]);
  });

  it("does nothing when the player cannot afford it", () => {
    const state = stateWith({ money: 5 });
    const result = buyToolAction("randomOrbitSander")(state);
    assert.strictEqual(result, state);
  });
});

describe("mountToolAction", () => {
  it("moves the tool from storage into the station's slots", () => {
    const state = toolState(initialGameState, ["sandingBlock"]);
    const result = mountToolAction(workspaceOf(state), "sandingBlock")(state);
    assert.deepStrictEqual(result.storage.tools, []);
    assert.deepStrictEqual(result.machines[0].tools, ["sandingBlock"]);
  });

  it("makes the tool's operations available on the station", () => {
    const state = toolState(initialGameState, ["sandingBlock"]);
    const result = mountToolAction(workspaceOf(state), "sandingBlock")(state);
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
    const result = mountToolAction(
      workspaceOf(state),
      "randomOrbitSander",
    )(state);
    assert.strictEqual(result, state);
  });

  it("refuses when the tool is not in storage", () => {
    const state = toolState(initialGameState, []);
    const result = mountToolAction(workspaceOf(state), "sandingBlock")(state);
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
    // The workspace isn't on the bag's compatible list
    const refused = mountToolAction(workspaceOf(state), "dustBag")(state);
    assert.strictEqual(refused, state);
    // The planer is
    const planerView = getMachines(state.machines).find(
      (machine) => machine.type.id === "planer",
    )!;
    const mounted = mountToolAction(planerView, "dustBag")(state);
    assert.deepStrictEqual(
      mounted.machines[mounted.machines.length - 1].tools,
      ["dustBag"],
    );
  });
});

describe("unmountToolAction", () => {
  it("returns the tool to storage", () => {
    const state = toolState(initialGameState, [], ["sandingBlock"]);
    const result = unmountToolAction(workspaceOf(state), "sandingBlock")(state);
    assert.deepStrictEqual(result.storage.tools, ["sandingBlock"]);
    assert.deepStrictEqual(result.machines[0].tools, []);
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

describe("pickUpMachineAction", () => {
  it("keeps mounted tools with the carried machine", () => {
    const state = toolState(initialGameState, [], ["sandingBlock"]);
    const result = pickUpMachineAction(state.machines[0])(state);
    assert.deepStrictEqual(result.player.carriedMachine?.tools, [
      "sandingBlock",
    ]);
  });
});
