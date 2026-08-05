import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { makePallet } from "../material-helpers";
import { MACHINE_TYPES, Machine, MachineState } from "../Machine";
import {
  benchPlacementFor,
  benchPointOnPallet,
  benchTopSizeIn,
  berthPlacementOnBench,
  defaultBenchPlacement,
  palletPointOnBench,
  seatOnBenchTop,
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
  it("measures a worktable's top from its footprint", () => {
    assert.deepStrictEqual(benchTopSizeIn(MACHINE_TYPES.worktable1x2), {
      widthIn: 48,
      heightIn: 24,
    });
  });

  it("takes the makeshift bench's plywood over its bucket footprint", () => {
    // The 4×3-ft footprint covers the buckets; only the sheet is bench
    assert.deepStrictEqual(benchTopSizeIn(MACHINE_TYPES.workspace), {
      widthIn: 40,
      heightIn: 30,
    });
  });

  it("seats an unplaced pallet squarely centered, overhang and all", () => {
    const pallet = makePallet();
    const seat = defaultBenchPlacement(MACHINE_TYPES.workspace, pallet);
    // A 46" pallet centered on a 40" top hangs 3" past each end
    assert.deepStrictEqual(seat, {
      xIn: 20,
      yIn: 15,
      angleDeg: 0,
      flipped: false,
    });
    assert.ok(seat.xIn - PALLET_WIDTH_IN / 2 < 0);
  });

  describe("seating stock on the bench top", () => {
    const bench = MACHINE_TYPES.workspace;

    it("leaves a piece already fully on the bench alone", () => {
      const piece = board("pallet", 24, 6, 4);
      const placement = { xIn: 20, yIn: 15, angleDeg: 0, flipped: false };
      assert.deepStrictEqual(
        seatOnBenchTop(bench, piece, placement),
        placement,
      );
    });

    it("slides a piece dragged off the edge back on", () => {
      const piece = board("pallet", 24, 6, 4);
      // Shoved past the right edge and off the front of a 40×30 top
      const seated = seatOnBenchTop(bench, piece, {
        xIn: 60,
        yIn: 40,
        angleDeg: 0,
        flipped: false,
      });
      // 6" wide, 24" long: 3" and 12" of clearance to keep
      assert.strictEqual(seated.xIn, 37);
      assert.strictEqual(seated.yIn, 18);
    });

    it("measures the piece as it lies, turned", () => {
      const piece = board("pallet", 24, 6, 4);
      // Turned across the bench, the 24" length is what has to fit
      const seated = seatOnBenchTop(bench, piece, {
        xIn: 60,
        yIn: 40,
        angleDeg: 90,
        flipped: false,
      });
      assert.ok(Math.abs(seated.xIn - 28) < 1e-9);
      assert.ok(Math.abs(seated.yIn - 27) < 1e-9);
    });

    it("gives a board stood on edge the edge its thickness reaches", () => {
      const piece = board("pallet", 24, 6, 4);
      const flat = seatOnBenchTop(bench, piece, {
        xIn: 60,
        yIn: 15,
        angleDeg: 0,
        flipped: false,
      });
      const onEdge = seatOnBenchTop(bench, piece, {
        xIn: 60,
        yIn: 15,
        angleDeg: 0,
        flipped: false,
        onEdge: true,
      });
      // A 4/4 board on edge is 1" across, not 6": it gets 2.5" closer
      assert.strictEqual(onEdge.xIn - flat.xIn, 2.5);
    });

    it("lets stock too big for the bench hang off, middle still on", () => {
      // A 46 × 34 pallet outsizes the 40 × 30 top on both axes, so all
      // that's asked is that its middle stays over the wood
      const onTop = { xIn: 12, yIn: 8, angleDeg: 0, flipped: false };
      assert.deepStrictEqual(seatOnBenchTop(bench, makePallet(), onTop), onTop);
      const shoved = seatOnBenchTop(bench, makePallet(), {
        ...onTop,
        xIn: 90,
        yIn: -20,
      });
      assert.strictEqual(shoved.xIn, 40);
      assert.strictEqual(shoved.yIn, 0);
    });
  });

  it("carries pallet points through the placement, there and back", () => {
    // Turned a quarter and flipped, dragged off-center
    const placement = { xIn: 20, yIn: 10, angleDeg: 90, flipped: true };
    const local = { xIn: 5, yIn: 8 };
    const bench = palletPointOnBench(placement, local.xIn, local.yIn);
    const back = benchPointOnPallet(placement, bench.xIn, bench.yIn);
    assert.ok(Math.abs(back.xIn - local.xIn) < 1e-9);
    assert.ok(Math.abs(back.yIn - local.yIn) < 1e-9);
  });

  it("a berth rides the pallet's turn and flip", () => {
    const square = { xIn: 23, yIn: 17, angleDeg: 0, flipped: false };
    const berth = { xIn: 0, yIn: 17, angleDeg: 0 };
    // Squarely placed: the berth is just offset by the pallet's corner
    const plain = berthPlacementOnBench(square, berth);
    assert.strictEqual(plain.xIn, 23 - PALLET_WIDTH_IN / 2);
    assert.strictEqual(plain.yIn, 17);
    assert.strictEqual(plain.flipped, false);
    // Flipped: the same berth mirrors to the other side, face down
    const flipped = berthPlacementOnBench({ ...square, flipped: true }, berth);
    assert.strictEqual(flipped.xIn, 23 + PALLET_WIDTH_IN / 2);
    assert.strictEqual(flipped.flipped, true);
    // Turned a quarter: the berth swings with it
    const turned = berthPlacementOnBench({ ...square, angleDeg: 90 }, berth);
    assert.strictEqual(turned.angleDeg, 90);
    assert.ok(Math.abs(turned.xIn - 23) < 1e-9);
    assert.ok(Math.abs(turned.yIn - (17 - PALLET_WIDTH_IN / 2)) < 1e-9);
  });

  it("seats an unplaced piece deterministically by its id", () => {
    const piece = board("pallet", 36, 4, 2);
    const first = defaultBenchPlacement(MACHINE_TYPES.workspace, piece);
    const again = defaultBenchPlacement(MACHINE_TYPES.workspace, piece);
    assert.deepStrictEqual(first, again);
    // On the bench, not off in space
    assert.ok(first.xIn > 0 && first.xIn < 40);
    assert.ok(first.yIn > 0 && first.yIn < 30);
  });

  it("prefers the stored placement over the seed", () => {
    const piece = board("pallet", 36, 4, 2);
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
