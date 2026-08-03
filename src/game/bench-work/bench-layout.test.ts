import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { MACHINE_TYPES, Machine, MachineState } from "../Machine";
import {
  benchPlacementFor,
  benchTopSizeIn,
  defaultBenchPlacement,
  palletOriginOnBench,
} from "./bench-layout";
import { PALLET_WIDTH_IN } from "./pallet-geometry";

function benchWith(overrides: Partial<MachineState>): Machine {
  return new Machine({
    machineTypeId: "workspace",
    position: [0, 0],
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
    ...overrides,
  });
}

describe("bench layout", () => {
  it("measures the bench top from the footprint", () => {
    assert.deepStrictEqual(benchTopSizeIn(MACHINE_TYPES.workspace), {
      widthIn: 36,
      heightIn: 24,
    });
    assert.deepStrictEqual(benchTopSizeIn(MACHINE_TYPES.worktable1x2), {
      widthIn: 48,
      heightIn: 24,
    });
  });

  it("centers the pallet on the bench, overhang and all", () => {
    const origin = palletOriginOnBench(MACHINE_TYPES.workspace);
    // A 46" pallet on a 36" bench hangs 5" past each end
    assert.strictEqual(origin.xIn, (36 - PALLET_WIDTH_IN) / 2);
    assert.ok(origin.xIn < 0);
  });

  it("seats an unplaced piece deterministically by its id", () => {
    const piece = board("pallet", 3, 4, 1);
    const first = defaultBenchPlacement(MACHINE_TYPES.workspace, piece);
    const again = defaultBenchPlacement(MACHINE_TYPES.workspace, piece);
    assert.deepStrictEqual(first, again);
    // On the bench, not off in space
    assert.ok(first.xIn > 0 && first.xIn < 36);
    assert.ok(first.yIn > 0 && first.yIn < 24);
  });

  it("prefers the stored placement over the seed", () => {
    const piece = board("pallet", 3, 4, 1);
    const stored = { xIn: 3, yIn: 4, angleDeg: 270, flipped: true };
    const machine = benchWith({
      inputMaterials: [piece],
      benchLayout: { [piece.id]: stored },
    });
    assert.deepStrictEqual(benchPlacementFor(machine, piece), stored);
    const bare = benchWith({ inputMaterials: [piece] });
    assert.deepStrictEqual(
      benchPlacementFor(bare, piece),
      defaultBenchPlacement(MACHINE_TYPES.workspace, piece),
    );
  });
});
