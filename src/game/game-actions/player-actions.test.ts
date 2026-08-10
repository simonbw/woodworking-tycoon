import assert from "node:assert";
import { describe, it } from "node:test";
import { board, palletBoard } from "../board-helpers";
import { assemblyFramePlacement, slotOnBench } from "../bench-work/assembly";
import { benchTopSizeIn } from "../bench-work/bench-layout";
import { RUSTIC_SHELF_BLUEPRINT } from "../bench-work/blueprint";
import { GameState, MaterialPile } from "../GameState";
import { initialGameState } from "../initialGameState";
import { HAND_CAPACITY } from "../Person";
import { Machine, MachineState } from "../Machine";
import {
  dropMaterialAction,
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
  it("picks up from the cell the pile rests in", () => {
    const pile: MaterialPile = {
      material: board("pine", 96, 4, 1),
      position: [1.5, 3.5],
      rotation: 0,
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 3]));
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, 1);
  });

  it("picks up a long board from anywhere along its length", () => {
    const pile: MaterialPile = {
      material: board("pine", 96, 4, 1),
      position: [1.5, 3.5],
      rotation: 0,
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, 1);
  });

  it("refuses cells the board does not reach", () => {
    // An 8' board centered at [1.5, 3.5] ends at y 7.5; [1, 8] is past it
    const pile: MaterialPile = {
      material: board("pine", 96, 4, 1),
      position: [1.5, 3.5],
      rotation: 0,
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 8]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });

  it("keeps foot-long stock a close grab", () => {
    // A 1' board's end reaches the shared cell line, so the cell straight
    // ahead of it can still grab it — but a cell to the side, or two cells
    // away, cannot.
    const pile: MaterialPile = {
      material: board("pine", 12, 4, 1),
      position: [1.5, 3.5],
      rotation: 0,
    };
    const ahead = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(ahead.player.inventory.length, 1);
    const sideways = pickUpMaterialAction([pile])(stateWithPile(pile, [0, 3]));
    assert.strictEqual(sideways.materialPiles.length, 1);
    assert.strictEqual(sideways.player.inventory.length, 0);
    const far = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 1]));
    assert.strictEqual(far.materialPiles.length, 1);
    assert.strictEqual(far.player.inventory.length, 0);
  });

  it("refuses a load bigger than the arm room left", () => {
    // One free hand left; a two-pile grab doesn't fit and refuses whole
    const piles: MaterialPile[] = [
      { material: board("pine", 24, 4, 1), position: [1, 3], rotation: 0 },
      { material: board("pine", 24, 4, 1), position: [1, 3], rotation: 0 },
    ];
    const carried = Array.from({ length: HAND_CAPACITY - 1 }, () =>
      board("pine", 24, 4, 1),
    );
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [1, 3],
        inventory: carried,
      },
      materialPiles: piles,
    };
    const result = pickUpMaterialAction(piles)(state);
    assert.strictEqual(result.materialPiles.length, 2);
    assert.strictEqual(result.player.inventory.length, HAND_CAPACITY - 1);
  });

  it("still takes a single piece into the last free hand", () => {
    const pile: MaterialPile = {
      material: board("pine", 24, 4, 1),
      position: [1, 3],
      rotation: 0,
    };
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [1, 3],
        inventory: Array.from({ length: HAND_CAPACITY - 1 }, () =>
          board("pine", 24, 4, 1),
        ),
      },
      materialPiles: [pile],
    };
    const result = pickUpMaterialAction([pile])(state);
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, HAND_CAPACITY);
  });

  it("refuses any pickup once the hands are full", () => {
    const pile: MaterialPile = {
      material: board("pine", 24, 4, 1),
      position: [1, 3],
      rotation: 0,
    };
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [1, 3],
        inventory: Array.from({ length: HAND_CAPACITY }, () =>
          board("pine", 24, 4, 1),
        ),
      },
      materialPiles: [pile],
    };
    const result = pickUpMaterialAction([pile])(state);
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, HAND_CAPACITY);
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
  board("walnut", 48, 5, 4, "rough", { faces: 0, edges: 0 });

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
    const faceDone = board("walnut", 48, 5, 4, "rough", {
      faces: 1,
      edges: 0,
    });
    const state = stagedOn(jointer({ poweredOn: true }), [faceDone]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result.machines[0].selectedOperationId, "jointEdge");
    assert.deepStrictEqual(result.machines[0].processingMaterials, [faceDone]);
  });

  it("fully milled stock is refused — the jointer has nothing to add", () => {
    const milled = board("walnut", 48, 5, 4, "smooth", { faces: 2, edges: 2 });
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
    const stock = board("walnut", 96, 6, 4, "rough");
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
    const tooThick = board("walnut", 96, 6, 6, "rough");
    const fits = board("walnut", 96, 6, 5, "rough");
    const state = stagedOn(planer(), [tooThick, fits]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.deepStrictEqual(result.machines[0].processingMaterials, [fits]);
    // Anything on the table the cut didn't claim stays there
    assert.deepStrictEqual(result.machines[0].inputMaterials, [tooThick]);
  });

  it("refuses stock the cut height can't take", () => {
    // Two detents above the cut height won't fit under the head
    const state = stagedOn(planer(), [board("walnut", 96, 6, 6, "rough")]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
  });

  it("refuses while switched off, leaving the stock on the table", () => {
    const state = stagedOn(planer({ poweredOn: false }), [
      board("walnut", 96, 6, 4, "rough"),
    ]);
    const result = operateMachineAction(new Machine(state.machines[0]))(state);
    assert.strictEqual(result, state);
    assert.strictEqual(result.machines[0].inputMaterials.length, 1);
  });
});

/** A jointer part-way through a pass, stock on the beds. */
const working = (): MachineState =>
  jointer({
    operationProgress: {
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 5,
    },
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

describe("dropMaterialAction", () => {
  it("drops carried stock as a pile underfoot", () => {
    // Without an explicit landing point the piece rests at the center of
    // the cell the player occupies (the keyboard layer passes the body's
    // actual position instead).
    const material = board("pine", 48, 4, 1);
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [5, 5],
        inventory: [material],
      },
    };
    const result = dropMaterialAction([material])(state);
    assert.strictEqual(result.player.inventory.length, 0);
    assert.deepStrictEqual(result.materialPiles.at(-1)?.position, [5.5, 5.5]);
    assert.strictEqual(result.materialPiles.at(-1)?.rotation, 0);
  });

  it("drops at the landing point it is given", () => {
    const material = board("pine", 48, 4, 1);
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [5, 5],
        inventory: [material],
      },
    };
    const result = dropMaterialAction([material], [5.2, 5.8])(state);
    assert.deepStrictEqual(result.materialPiles.at(-1)?.position, [5.2, 5.8]);
  });

  it("keeps the orientation the piece was dropped in", () => {
    const material = board("pine", 48, 4, 1);
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [5, 5],
        inventory: [material],
      },
    };
    const result = dropMaterialAction(
      [material],
      [5.5, 5.5],
      Math.PI / 3,
    )(state);
    assert.strictEqual(result.materialPiles.at(-1)?.rotation, Math.PI / 3);
  });

  it("keeps stock in hand on the lot — no piles outdoors", () => {
    const material = board("pine", 48, 4, 1);
    const state: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        position: [6, 17],
        inventory: [material],
      },
    };
    const result = dropMaterialAction([material])(state);
    assert.strictEqual(result, state);
  });
});

describe("the blueprint assembly's claim", () => {
  it("consumes the seated boards, leaving spare matching stock on the bench", () => {
    // The spares come first in the bay: a first-match claim would take
    // them and leave the seated boards lying under the finished shelf
    const spares = [palletBoard(), palletBoard()];
    const seatedPieces = RUSTIC_SHELF_BLUEPRINT.slots.map(palletBoard);
    const base: MachineState = {
      machineTypeId: "workspace",
      position: [4, 2],
      rotation: 0,
      selectedOperationId: "buildRusticPalletShelf",
      selectedParameters: undefined,
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      inputMaterials: [...spares, ...seatedPieces],
      processingMaterials: [],
      outputMaterials: [],
      tools: ["hammer"],
    };
    const frame = assemblyFramePlacement(
      benchTopSizeIn(new Machine(base).type),
    );
    const bench: MachineState = {
      ...base,
      benchLayout: Object.fromEntries(
        RUSTIC_SHELF_BLUEPRINT.slots.map((slot, i) => [
          seatedPieces[i].id,
          {
            ...slotOnBench(RUSTIC_SHELF_BLUEPRINT, frame, slot),
            onEdge: slot.onEdge,
          },
        ]),
      ),
    };
    const state: GameState = {
      ...initialGameState,
      machines: [bench],
      consumables: { ...initialGameState.consumables, nails: 8 },
    };
    const result = operateMachineAction(new Machine(bench))(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
    assert.deepStrictEqual(
      result.machines[0].processingMaterials.map((m) => m.id).sort(),
      seatedPieces.map((m) => m.id).sort(),
    );
    assert.deepStrictEqual(
      result.machines[0].inputMaterials.map((m) => m.id).sort(),
      spares.map((m) => m.id).sort(),
    );
  });
});
