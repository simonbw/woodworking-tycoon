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
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 5]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });

  it("keeps short stock a one-cell grab", () => {
    const pile: MaterialPile = {
      material: board("pine", 2, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });
});

/** A jointer loaded with a rough board, ready to joint a face. */
function loadedJointer(overrides: Partial<MachineState> = {}): MachineState {
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
    inputMaterials: [board("walnut", 4, 5, 4, "rough", { faces: 0, edges: 0 })],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    ...overrides,
  };
}

function stateWithMachine(machine: MachineState): GameState {
  return { ...initialGameState, machines: [machine] };
}

describe("machine power switch", () => {
  it("toggleMachinePowerAction flips the switch both ways", () => {
    const state = stateWithMachine(loadedJointer());
    const on = toggleMachinePowerAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(on.machines[0].poweredOn, true);
    const off = toggleMachinePowerAction(new Machine(on.machines[0]))(on);
    assert.strictEqual(off.machines[0].poweredOn, false);
  });

  it("is a no-op on machines without a power switch", () => {
    const bench = loadedJointer({
      machineTypeId: "workspace",
      selectedOperationId: "dismantlePallet",
    });
    const state = stateWithMachine(bench);
    const result = toggleMachinePowerAction(new Machine(bench))(state);
    assert.strictEqual(result, state);
  });

  it("operateMachineAction refuses while the machine is switched off", () => {
    const state = stateWithMachine(loadedJointer());
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "notStarted",
    );
  });

  it("operateMachineAction starts the cut once switched on", () => {
    const state = stateWithMachine(loadedJointer({ poweredOn: true }));
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
    assert.strictEqual(result.machines[0].processingMaterials.length, 1);
  });
});
