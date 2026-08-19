import assert from "node:assert";
import { describe, it } from "node:test";
import { board, palletBoard } from "../board-helpers";
import { assemblyFramePlacement, slotOnBench } from "../bench-work/assembly";
import { benchTopSizeIn } from "../bench-work/bench-layout";
import { RUSTIC_SHELF_BLUEPRINT } from "../bench-work/blueprint";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { Machine, MachineState } from "../Machine";
import { operateMachineAction } from "./player-actions";

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

  it("builds with a half-seated frame — an empty slot can't take a seated board", () => {
    // Only the second support slot is seated, and its board sits first
    // in the bay. Filling the slots in one pass would hand that board to
    // the empty first slot, leaving the seated slot with nothing.
    // Six whole pallet boards build the shelf — one seated, five loose.
    const seatedSupport = palletBoard();
    const loose = [
      palletBoard(),
      palletBoard(),
      palletBoard(),
      palletBoard(),
      palletBoard(),
    ];
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
      inputMaterials: [seatedSupport, ...loose],
      processingMaterials: [],
      outputMaterials: [],
      tools: ["hammer"],
    };
    const frame = assemblyFramePlacement(
      benchTopSizeIn(new Machine(base).type),
    );
    const secondSlot = RUSTIC_SHELF_BLUEPRINT.slots[1];
    const bench: MachineState = {
      ...base,
      benchLayout: {
        [seatedSupport.id]: {
          ...slotOnBench(RUSTIC_SHELF_BLUEPRINT, frame, secondSlot),
          onEdge: secondSlot.onEdge,
        },
      },
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
      [seatedSupport, ...loose].map((m) => m.id).sort(),
    );
  });
});
