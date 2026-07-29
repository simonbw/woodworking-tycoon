import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState, MaterialPile } from "../GameState";
import { initialGameState } from "../initialGameState";
import { Machine, MachineState } from "../Machine";
import {
  operateMachineAction,
  pickUpMaterialAction,
  setMachineOperationAction,
  setMachineSettingsAction,
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
    // Mid-shop, so the feed lane has room both ways (see feed-clearance)
    position: [1, 8],
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
/**
 * A machine with stock already set down on it. Direct-feed machines run
 * what's on the table, not what's in your hands — F puts it there, Space
 * pulls the trigger — so operating starts from a staged input.
 */
function stagedOn(
  machine: MachineState,
  stock: GameState["player"]["inventory"],
): GameState {
  return {
    ...initialGameState,
    machines: [{ ...machine, inputMaterials: stock }],
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
    const state = stagedOn(jointer(), [roughStock()]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "notStarted",
    );
  });

  it("operateMachineAction starts the cut once switched on", () => {
    const state = stagedOn(jointer({ poweredOn: true }), [roughStock()]);
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
    const state = stagedOn(jointer({ poweredOn: true }), [roughStock()]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result.machines[0].selectedOperationId, "jointFace");
    assert.deepStrictEqual(result.machines[0].inputMaterials, []);
  });

  it("a face-jointed board gets its edge — no mode was ever picked", () => {
    const faceDone = board("walnut", 4, 5, 4, "rough", {
      faces: 1,
      edges: 0,
    });
    const state = stagedOn(jointer({ poweredOn: true }), [faceDone]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result.machines[0].selectedOperationId, "jointEdge");
    assert.deepStrictEqual(result.machines[0].processingMaterials, [faceDone]);
  });

  it("fully milled stock is refused — the jointer has nothing to add", () => {
    const milled = board("walnut", 4, 5, 4, "smooth", { faces: 2, edges: 2 });
    const state = stagedOn(jointer({ poweredOn: true }), [milled]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
  });
});

/** A powered planer set to a 4/4 cut height, with an empty table. */
function planer(overrides: Partial<MachineState> = {}): MachineState {
  return {
    machineTypeId: "lunchboxPlaner",
    // Mid-shop: an 8' pass needs 6' of lane each side of the beds
    position: [1, 8],
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

describe("direct feed (planer)", () => {
  it("feeds the carried board straight into the cut", () => {
    // 4/4 rough with a flat face: a skim pass at cut height 4
    const stock = board("walnut", 8, 6, 4, "rough");
    const state = stagedOn(planer(), [stock]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
    assert.deepStrictEqual(result.machines[0].processingMaterials, [stock]);
    // Off the table and into the cut
    assert.deepStrictEqual(result.machines[0].inputMaterials, []);
  });

  it("feeds the first carried piece the machine is set up to take", () => {
    const tooThick = board("walnut", 8, 6, 6, "rough");
    const fits = board("walnut", 8, 6, 5, "rough");
    const state = stagedOn(planer(), [tooThick, fits]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.deepStrictEqual(result.machines[0].processingMaterials, [fits]);
    // Anything on the table the cut didn't claim stays there
    assert.deepStrictEqual(result.machines[0].inputMaterials, [tooThick]);
  });

  it("refuses stock the cut height can't take", () => {
    // Two detents above the cut height won't fit under the head
    const state = stagedOn(planer(), [board("walnut", 8, 6, 6, "rough")]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
  });

  it("refuses while switched off, leaving the stock on the table", () => {
    const state = stagedOn(planer({ poweredOn: false }), [
      board("walnut", 8, 6, 4, "rough"),
    ]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
    assert.strictEqual(result.machines[0].inputMaterials.length, 1);
  });
});

/** A jointer part-way through a pass, stock on the beds. */
const working = (): MachineState =>
  jointer({
    operationProgress: { status: "inProgress", phaseIndex: 0, ticksRemaining: 5 },
    processingMaterials: [roughStock()],
    selectedParameters: { targetThickness: 4 },
  });

describe("settings lock while a station is working", () => {
  it("setMachineSettingsAction refuses mid-operation", () => {
    const state = stateWithMachine(working());
    const result = setMachineSettingsAction(new Machine(state.machines[0]), {
      targetThickness: 8,
    })(state);
    assert.strictEqual(result, state);
  });

  it("setMachineSettingsAction turns the knob once the machine is idle", () => {
    const state = stateWithMachine(
      jointer({ selectedParameters: { targetThickness: 4 } }),
    );
    const result = setMachineSettingsAction(new Machine(state.machines[0]), {
      targetThickness: 8,
    })(state);
    assert.strictEqual(
      result.machines[0].selectedParameters?.targetThickness,
      8,
    );
  });

  it("setMachineOperationAction refuses mid-operation", () => {
    const state = stateWithMachine(working());
    const machine = new Machine(state.machines[0]);
    const other = machine.type.operations.find(
      (operation) => operation.id !== machine.state.selectedOperationId,
    )!;
    const result = setMachineOperationAction(machine, other)(state);
    assert.strictEqual(result, state);
  });
});
