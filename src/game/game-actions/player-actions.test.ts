import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState, MaterialPile } from "../GameState";
import { initialGameState } from "../initialGameState";
import { Machine, MachineState } from "../Machine";
import {
  operateMachineAction,
  pickUpMaterialAction,
  toggleMachinePowerAction,
} from "./player-actions";

function stateWithPile(
  pile: MaterialPile,
  playerPosition: [number, number],
): GameState {
  return {
    ...initialGameState,
    player: { ...initialGameState.player, position: playerPosition },
    materialPiles: [pile],
  };
}

describe("pickUpMaterialAction", () => {
  it("picks up from the pile's anchor cell", () => {
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 3]));
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, 1);
  });

  it("picks up a long board from a cell it overhangs", () => {
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, 1);
  });

  it("refuses cells the board does not reach", () => {
    // An 8' board spans four cells past its anchor; [1, 8] is beyond it
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 8]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });

  it("keeps foot-long stock a one-cell grab", () => {
    const pile: MaterialPile = {
      material: board("pine", 1, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });
});

/** An idle jointer; the stock rides in the player's hands (direct feed). */
function jointer(overrides: Partial<MachineState> = {}): MachineState {
  return {
    machineTypeId: "jointer",
    position: [1, 1],
    rotation: 0,
    selectedOperationId: "jointFace",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    ...overrides,
  };
}

const roughStock = () =>
  board("walnut", 4, 5, 4, "rough", { faces: 0, edges: 0 });

function stateWithMachine(machine: MachineState): GameState {
  return { ...initialGameState, machines: [machine] };
}

/** Like stateWithMachine, with materials in the player's hands. */
function carryingAt(
  machine: MachineState,
  inventory: GameState["player"]["inventory"],
): GameState {
  return {
    ...initialGameState,
    machines: [machine],
    player: { ...initialGameState.player, inventory },
  };
}

describe("machine power switch", () => {
  it("toggleMachinePowerAction flips the switch both ways", () => {
    const state = stateWithMachine(jointer());
    const on = toggleMachinePowerAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(on.machines[0].poweredOn, true);
    const off = toggleMachinePowerAction(new Machine(on.machines[0]))(on);
    assert.strictEqual(off.machines[0].poweredOn, false);
  });

  it("is a no-op on machines without a power switch", () => {
    const bench = jointer({
      machineTypeId: "workspace",
      selectedOperationId: "dismantlePallet",
    });
    const state = stateWithMachine(bench);
    const result = toggleMachinePowerAction(new Machine(bench))(state);
    assert.strictEqual(result, state);
  });

  it("operateMachineAction refuses while the machine is switched off", () => {
    const state = carryingAt(jointer(), [roughStock()]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "notStarted",
    );
  });

  it("operateMachineAction starts the cut once switched on", () => {
    const state = carryingAt(jointer({ poweredOn: true }), [roughStock()]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
    assert.strictEqual(result.machines[0].processingMaterials.length, 1);
  });
});

describe("direct feed infers the operation from the stock (jointer)", () => {
  it("a rough board gets a face pass", () => {
    const state = carryingAt(jointer({ poweredOn: true }), [roughStock()]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result.machines[0].selectedOperationId, "jointFace");
    assert.deepStrictEqual(result.player.inventory, []);
  });

  it("a face-jointed board gets its edge — no mode was ever picked", () => {
    const faceDone = board("walnut", 4, 5, 4, "rough", {
      faces: 1,
      edges: 0,
    });
    const state = carryingAt(jointer({ poweredOn: true }), [faceDone]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result.machines[0].selectedOperationId, "jointEdge");
    assert.deepStrictEqual(result.machines[0].processingMaterials, [faceDone]);
  });

  it("fully milled stock is refused — the jointer has nothing to add", () => {
    const milled = board("walnut", 4, 5, 4, "smooth", { faces: 2, edges: 2 });
    const state = carryingAt(jointer({ poweredOn: true }), [milled]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
  });
});

/** A powered planer set to a 4/4 cut height, with nothing staged. */
function planer(overrides: Partial<MachineState> = {}): MachineState {
  return {
    machineTypeId: "lunchboxPlaner",
    position: [1, 1],
    rotation: 0,
    selectedOperationId: "plane",
    selectedParameters: { targetThickness: 4 },
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    poweredOn: true,
    ...overrides,
  };
}

function carrying(
  machine: MachineState,
  inventory: GameState["player"]["inventory"],
): GameState {
  return {
    ...initialGameState,
    machines: [machine],
    player: { ...initialGameState.player, inventory },
  };
}

describe("direct feed (planer)", () => {
  it("feeds the carried board straight into the cut", () => {
    // 4/4 rough with a flat face: a skim pass at cut height 4
    const stock = board("walnut", 8, 6, 4, "rough");
    const state = carrying(planer(), [stock]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
    assert.deepStrictEqual(result.machines[0].processingMaterials, [stock]);
    // Out of the hands, and never in the (nonexistent) input bay
    assert.deepStrictEqual(result.player.inventory, []);
    assert.deepStrictEqual(result.machines[0].inputMaterials, []);
  });

  it("feeds the first carried piece the machine is set up to take", () => {
    const tooThick = board("walnut", 8, 6, 6, "rough");
    const fits = board("walnut", 8, 6, 5, "rough");
    const state = carrying(planer(), [tooThick, fits]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.deepStrictEqual(result.machines[0].processingMaterials, [fits]);
    assert.deepStrictEqual(result.player.inventory, [tooThick]);
  });

  it("refuses stock the cut height can't take", () => {
    // Two detents above the cut height won't fit under the head
    const state = carrying(planer(), [board("walnut", 8, 6, 6, "rough")]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
  });

  it("refuses while switched off, leaving the hands full", () => {
    const state = carrying(planer({ poweredOn: false }), [
      board("walnut", 8, 6, 4, "rough"),
    ]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
    assert.strictEqual(result.player.inventory.length, 1);
  });
});
