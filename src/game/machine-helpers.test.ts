import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import {
  InputMaterialWithQuantity,
  Machine,
  MachineId,
  ParameterizedOperation,
  ParameterValues,
} from "./Machine";
import {
  matchMaterialsToSlots,
  parameterValueSatisfiable,
} from "./machine-helpers";
import { MaterialInstance } from "./Materials";

describe("matchMaterialsToSlots", () => {
  it("should match all materials when placed in correct order", () => {
    const materials = [
      board("pallet", 4, 6, 3), // stringer
      board("pallet", 4, 6, 3), // stringer
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      },
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      },
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5);
    assert.strictEqual(
      slots.filter((slot) => slot.isValid).length,
      5,
      "All slots should be valid",
    );
    assert.strictEqual(
      slots.filter((slot) => slot.isPlaceholder).length,
      0,
      "No placeholders should exist",
    );
  });

  it("should match materials even when placed in wrong order", () => {
    // Place deck boards first, then stringers - opposite of requirement order
    const materials = [
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
      board("pallet", 4, 6, 3), // stringer
      board("pallet", 4, 6, 3), // stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      }, // stringers first
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      }, // decks second
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    // This test will FAIL with current implementation
    // After two-pass fix, all 5 should be valid
    assert.strictEqual(slots.length, 5);
    const validCount = slots.filter((slot) => slot.isValid).length;
    assert.strictEqual(
      validCount,
      5,
      `Expected all materials to match, but only ${validCount}/5 were valid`,
    );
  });

  it("should handle partial materials with placeholders", () => {
    const materials = [
      board("pallet", 4, 6, 3), // only 1 stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      },
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      },
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5, "Should create 5 slots total");
    assert.strictEqual(
      slots.filter((slot) => slot.isValid && !slot.isPlaceholder).length,
      1,
      "Should have 1 valid material",
    );
    assert.strictEqual(
      slots.filter((slot) => slot.isPlaceholder).length,
      4,
      "Should have 4 placeholders",
    );
  });

  it("should create all placeholders when no materials provided", () => {
    const materials: MaterialInstance[] = [];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      },
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 2);
    assert.strictEqual(
      slots.filter((slot) => slot.isPlaceholder).length,
      2,
      "All slots should be placeholders",
    );
    assert.strictEqual(
      slots.filter((slot) => slot.isValid).length,
      0,
      "No slots should be valid",
    );
  });

  it("should handle mix of valid and invalid materials", () => {
    // User places 3 wrong boards, then 2 correct stringers
    const materials = [
      board("pine", 8, 4, 1), // wrong species
      board("pine", 8, 4, 1), // wrong species
      board("pine", 8, 4, 1), // wrong species
      board("pallet", 4, 6, 3), // correct stringer
      board("pallet", 4, 6, 3), // correct stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      }, // stringers
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      }, // decks
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5);

    // With current implementation:
    // - Slots 0-1 should have the valid stringers (isValid: true)
    // - Slots 2-4 should have the pine boards (isValid: false)
    const validSlots = slots.filter(
      (slot) => slot.isValid && !slot.isPlaceholder,
    );
    assert.strictEqual(validSlots.length, 2, "Should have 2 valid stringers");

    const invalidSlots = slots.filter(
      (slot) => !slot.isValid && !slot.isPlaceholder,
    );
    assert.strictEqual(
      invalidSlots.length,
      3,
      "Should have 3 invalid materials in wrong slots",
    );
  });

  it("should handle partial materials in wrong placement order (THE BUG)", () => {
    // This is the actual issue the user experiences:
    // User places deck boards first, then adds stringers one at a time
    const materials = [
      board("pallet", 3, 4, 1), // deck board placed first
      board("pallet", 4, 6, 3), // stringer placed second
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      }, // stringers required first
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      }, // decks required second
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5);

    // DESIRED BEHAVIOR (with two-pass):
    // All valid materials should show as valid, regardless of placement order
    const validSlots = slots.filter(
      (slot) => slot.isValid && !slot.isPlaceholder,
    );
    assert.strictEqual(
      validSlots.length,
      2,
      "Both materials should be valid (1 stringer, 1 deck)",
    );

    // CURRENT BEHAVIOR (will fail):
    // Slot 0 (stringer): gets the stringer ✓
    // Slot 1 (stringer): gets the deck board ✗ (shows red/invalid)
    // Slots 2-4 (decks): placeholders
    // The deck board shows as INVALID even though it's a correct material!
  });
});

describe("parameterValueSatisfiable", () => {
  function machineWith(
    machineTypeId: MachineId,
    operationId: string,
    parameters: ParameterValues,
    inputs: MaterialInstance[],
  ): { machine: Machine; operation: ParameterizedOperation } {
    const machine = new Machine({
      machineTypeId,
      position: [0, 0],
      rotation: 0,
      selectedOperationId: operationId,
      selectedParameters: parameters,
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      inputMaterials: inputs,
      processingMaterials: [],
      outputMaterials: [],
      tools: [],
    });
    return {
      machine,
      operation: machine.selectedOperation as ParameterizedOperation,
    };
  }

  it("treats every value as satisfiable while nothing is loaded", () => {
    const { machine, operation } = machineWith(
      "miterSaw",
      "cutBoard",
      { targetLength: 4 },
      [],
    );
    for (const value of operation.parameters[0].values) {
      assert.ok(
        parameterValueSatisfiable(machine, operation, "targetLength", value),
      );
    }
  });

  it("rules out lengths a loaded board can't be cut to", () => {
    const { machine, operation } = machineWith(
      "miterSaw",
      "cutBoard",
      { targetLength: 4 },
      [board("pine", 6, 4, 4)],
    );
    // A crosscut only shortens: strictly-below values work, 6' and up don't
    assert.ok(parameterValueSatisfiable(machine, operation, "targetLength", 4));
    assert.ok(
      !parameterValueSatisfiable(machine, operation, "targetLength", 6),
    );
    assert.ok(
      !parameterValueSatisfiable(machine, operation, "targetLength", 8),
    );
  });

  it("planer cut height reads against carried stock: skim or one detent", () => {
    // Direct feed: the planer has no input bay, so the stock under test
    // rides in the explicit `stock` argument (the player's hands).
    const { machine, operation } = machineWith(
      "lunchboxPlaner",
      "plane",
      { targetThickness: 4 },
      [],
    );
    const carried = [board("pine", 6, 4, 4)];
    // Skim pass at the loaded thickness
    assert.ok(
      parameterValueSatisfiable(
        machine,
        operation,
        "targetThickness",
        4,
        carried,
      ),
    );
    // One detent below: a full-depth bite
    assert.ok(
      parameterValueSatisfiable(
        machine,
        operation,
        "targetThickness",
        3,
        carried,
      ),
    );
    // Two below won't fit under the cutter head in one pass
    assert.ok(
      !parameterValueSatisfiable(
        machine,
        operation,
        "targetThickness",
        2,
        carried,
      ),
    );
    // Above the board the knives never touch it
    assert.ok(
      !parameterValueSatisfiable(
        machine,
        operation,
        "targetThickness",
        6,
        carried,
      ),
    );
  });
});

describe("absoluteOutputPosition", () => {
  function machineAt(rotation: 0 | 1 | 2 | 3): Machine {
    return new Machine({
      machineTypeId: "lunchboxPlaner",
      position: [2, 2],
      rotation,
      selectedOperationId: "plane",
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
    });
  }

  it("mirrors the operation cell through the machine at every rotation", () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const machine = machineAt(rotation);
      const operation = machine.absoluteOperationPosition!;
      const output = machine.absoluteOutputPosition!;
      // The planer's outfeed is directly opposite its infeed
      assert.deepStrictEqual(output, [
        2 * machine.position[0] - operation[0],
        2 * machine.position[1] - operation[1],
      ]);
    }
  });

  it("is null for single-point stations like the miter saw", () => {
    const machine = new Machine({
      machineTypeId: "miterSaw",
      position: [2, 2],
      rotation: 0,
      selectedOperationId: "cutBoard",
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
    });
    assert.strictEqual(machine.absoluteOutputPosition, null);
  });
});
