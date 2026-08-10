import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { initialPalletNails } from "./bench-work/pallet-geometry";
import {
  getMachines,
  InputMaterialWithQuantity,
  Machine,
  MachineId,
  MachineState,
  Operation,
  ParameterValues,
  operationParameters,
} from "./Machine";
import { initialGameState } from "./initialGameState";
import {
  findFeedableOperation,
  liveSettingParameter,
  matchMaterialsToSlots,
  parameterValueSatisfiable,
  stageableMaterials,
} from "./machine-helpers";
import { MaterialInstance } from "./Materials";

describe("matchMaterialsToSlots", () => {
  it("should match all materials when placed in correct order", () => {
    const materials = [
      board("pallet", 48, 6, 6), // stringer
      board("pallet", 48, 6, 6), // stringer
      board("pallet", 36, 4, 2), // deck
      board("pallet", 36, 4, 2), // deck
      board("pallet", 36, 4, 2), // deck
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [48],
        quantity: 2,
      },
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [36],
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
      board("pallet", 36, 4, 2), // deck
      board("pallet", 36, 4, 2), // deck
      board("pallet", 36, 4, 2), // deck
      board("pallet", 48, 6, 6), // stringer
      board("pallet", 48, 6, 6), // stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [48],
        quantity: 2,
      }, // stringers first
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [36],
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
      board("pallet", 48, 6, 6), // only 1 stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [48],
        quantity: 2,
      },
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [36],
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
        length: [48],
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
      board("pine", 96, 4, 1), // wrong species
      board("pine", 96, 4, 1), // wrong species
      board("pine", 96, 4, 1), // wrong species
      board("pallet", 48, 6, 6), // correct stringer
      board("pallet", 48, 6, 6), // correct stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [48],
        quantity: 2,
      }, // stringers
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [36],
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
      board("pallet", 36, 4, 2), // deck board placed first
      board("pallet", 48, 6, 6), // stringer placed second
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [48],
        quantity: 2,
      }, // stringers required first
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [36],
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
  ): { machine: Machine; operation: Operation } {
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
      operation: machine.selectedOperation as Operation,
    };
  }

  it("treats every value as satisfiable while nothing is loaded", () => {
    const { machine, operation } = machineWith(
      "miterSaw",
      "cutBoard",
      { cutPosition: 48 },
      [],
    );
    for (const value of operationParameters(operation)[0].values) {
      assert.ok(
        parameterValueSatisfiable(machine, operation, "cutPosition", value),
      );
    }
  });

  it("rules out cut lines the loaded board doesn't reach", () => {
    const { machine, operation } = machineWith(
      "miterSaw",
      "cutBoard",
      { cutPosition: 48 },
      [board("pine", 72, 4, 4)],
    );
    // The line must land inside the board: marks short of 6' work, the
    // board's own end and beyond don't
    assert.ok(parameterValueSatisfiable(machine, operation, "cutPosition", 48));
    assert.ok(parameterValueSatisfiable(machine, operation, "cutPosition", 60));
    assert.ok(
      !parameterValueSatisfiable(machine, operation, "cutPosition", 72),
    );
    assert.ok(
      !parameterValueSatisfiable(machine, operation, "cutPosition", 84),
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
    const carried = [board("pine", 72, 4, 4)];
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

describe("findFeedableOperation", () => {
  /** A table saw with both shop-made sleds mounted. */
  function loadedSaw(selectedParameters?: ParameterValues): Machine {
    return new Machine({
      machineTypeId: "jobsiteTableSaw",
      position: [2, 2],
      rotation: 0,
      selectedOperationId: "ripBoard",
      selectedParameters,
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      tools: ["crosscutSled", "straightLineSled"],
    });
  }

  it("the carried stock decides the cut — the specs are disjoint", () => {
    const saw = loadedSaw({ targetWidth: 4 });
    // A rough edge can't ride the fence: it goes on the straight-line sled
    const rough = board("walnut", 96, 6, 4, "rough", { faces: 0, edges: 0 });
    assert.strictEqual(
      findFeedableOperation(saw, saw.operations, [rough])?.operation.id,
      "straightLineRip",
    );
    // An edge-jointed board rips against the fence
    const jointed = board("walnut", 96, 6, 4, "rough", { faces: 1, edges: 1 });
    assert.strictEqual(
      findFeedableOperation(saw, saw.operations, [jointed])?.operation.id,
      "ripBoard",
    );
  });

  it("reads the machine's settings bag, with defaults underneath", () => {
    // Fence at 6": a 6"-wide board can't be ripped narrower than it is
    const saw = loadedSaw({ targetWidth: 6 });
    const jointed = board("walnut", 96, 6, 4, "rough", { faces: 1, edges: 1 });
    assert.strictEqual(
      findFeedableOperation(saw, saw.operations, [jointed]),
      null,
    );
  });

  it("consumes the matching piece and returns the rest", () => {
    const saw = loadedSaw({ targetWidth: 4 });
    const rough = board("walnut", 96, 6, 4, "rough", { faces: 0, edges: 0 });
    const spare = board("pine", 24, 2, 1);
    const match = findFeedableOperation(saw, saw.operations, [spare, rough]);
    // The pine offcut satisfies neither op at these settings; walnut rides
    // the sled and the pine stays in hand
    assert.strictEqual(match?.operation.id, "straightLineRip");
    assert.deepStrictEqual(match?.materials, [rough]);
    assert.deepStrictEqual(match?.remaining, [spare]);
  });
});

describe("stageableMaterials on a bench", () => {
  function bench(overrides: Partial<MachineState> = {}): Machine {
    return getMachines([
      {
        machineTypeId: "workspace",
        position: [1, 2],
        rotation: 0,
        inputMaterials: [],
        processingMaterials: [],
        outputMaterials: [],
        // A fresh bench: nothing selected (no id resolves to a plan)
        selectedOperationId: "",
        operationProgress: {
          status: "notStarted",
          phaseIndex: 0,
          ticksRemaining: 0,
        },
        tools: [],
        ...overrides,
      },
    ])[0];
  }

  const fullPallet: MaterialInstance = {
    id: "test-pallet",
    type: "pallet",
    deckBoards: Array(11).fill(true) as never,
    stringers: [true, true, true],
    nails: initialPalletNails(Array(11).fill(true), [true, true, true]),
  };

  it("takes a pallet with no plan selected — a bench is a table", () => {
    const staged = stageableMaterials(bench(), [fullPallet]);
    assert.deepStrictEqual(staged, [fullPallet]);
  });

  it("takes boards regardless of which plan is selected", () => {
    const walnut = board("walnut", 48, 6, 4);
    const staged = stageableMaterials(
      bench({ selectedOperationId: "dismantlePallet" }),
      [walnut],
    );
    assert.deepStrictEqual(staged, [walnut]);
  });

  it("still refuses when the bench top is full", () => {
    const full = bench({
      inputMaterials: Array.from({ length: 12 }, () =>
        board("pine", 24, 4, 4, "rough"),
      ),
    });
    assert.deepStrictEqual(stageableMaterials(full, [fullPallet]), []);
  });
});

describe("liveSettingParameter at a bench", () => {
  function bench(overrides: Partial<MachineState>): Machine {
    return getMachines([
      {
        machineTypeId: "workspace",
        position: [1, 2],
        rotation: 0,
        inputMaterials: [],
        processingMaterials: [],
        outputMaterials: [],
        selectedOperationId: "none",
        operationProgress: {
          status: "notStarted",
          phaseIndex: 0,
          ticksRemaining: 0,
        },
        tools: [],
        ...overrides,
      },
    ])[0];
  }

  const progression = initialGameState.progression;

  it("leaves the hand saw's dials to the bench view", () => {
    // The saw carries angle/cutEnd/targetLength, but the mark measures
    // the cut and R swings the miter box inside the view — a dial for
    // them anywhere else is a stale second copy (docs/bench-work.md).
    const sawing = bench({
      tools: ["handSaw"],
      selectedOperationId: "handSawCut",
    });
    assert.strictEqual(
      liveSettingParameter(sawing, progression, "linear"),
      undefined,
    );
    assert.strictEqual(
      liveSettingParameter(sawing, progression, "rotate"),
      undefined,
    );
  });

  it("has nothing to step with no drawing pulled", () => {
    assert.strictEqual(
      liveSettingParameter(bench({}), progression, "linear"),
      undefined,
    );
  });
});
