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
  palletStackPlacement,
} from "./bench-layout";
import { PALLET_HEIGHT_IN, PALLET_WIDTH_IN } from "./pallet-geometry";

/** The hand-stacked slop palletStackPlacement allows, plus a hair. */
const PILE_SLOP = 0.8;

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
    // A 34" square pallet on a 40 × 30 top: room to spare across the
    // bench, and 2" hanging past each end of the short way
    assert.deepStrictEqual(seat, {
      xIn: 20,
      yIn: 15,
      angleDeg: 0,
      flipped: false,
    });
    assert.ok(seat.xIn - PALLET_WIDTH_IN / 2 > 0);
    assert.ok(seat.yIn - PALLET_HEIGHT_IN / 2 < 0);
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

  it("piles freed pallet boards in the bench's back-left corner", () => {
    const deck = palletStackPlacement(
      MACHINE_TYPES.workspace,
      { kind: "deck", index: 6 },
      "p:deck-6",
    );
    // Lying across the bench, back edge and left edge: a 36" deck board
    // on a 40" top rides 18" in from the left, 2" down from the back
    assert.ok(Math.abs(deck.xIn - 18) <= PILE_SLOP, `x was ${deck.xIn}`);
    assert.ok(Math.abs(deck.yIn - 2) <= PILE_SLOP, `y was ${deck.yIn}`);
    assert.ok(Math.abs(deck.angleDeg - 90) <= 5);
    // Its middle is on the top, so the bench can actually hold it
    assert.ok(deck.xIn > 0 && deck.xIn < 40);
    assert.ok(deck.yIn > 0 && deck.yIn < 30);
  });

  it("gives the stringers their own lane in front of the deck boards", () => {
    const deck = palletStackPlacement(
      MACHINE_TYPES.workspace,
      { kind: "deck", index: 0 },
      "p:deck-0",
    );
    const stringer = palletStackPlacement(
      MACHINE_TYPES.workspace,
      { kind: "stringer", index: 0 },
      "p:stringer-0",
    );
    // Stripping a pallet sorts as it goes: the two piles don't overlap.
    // One board builds the whole pallet, so the lanes are both a board
    // wide and sit edge to edge — 4" between their centers.
    assert.ok(stringer.yIn > deck.yIn);
    assert.ok(stringer.yIn - deck.yIn >= 4 - PILE_SLOP);
    // Same board, same length: the stringer lane goes flush left where
    // the deck lane does, rather than centering the way a longer one did
    assert.ok(Math.abs(stringer.xIn - 18) <= PILE_SLOP);
  });

  it("seats a freed board deterministically by its id", () => {
    const target = { kind: "deck", index: 3 } as const;
    const first = palletStackPlacement(MACHINE_TYPES.workspace, target, "p:d3");
    const again = palletStackPlacement(MACHINE_TYPES.workspace, target, "p:d3");
    assert.deepStrictEqual(first, again);
    // Neighbors land on the same pile without landing identically
    const sibling = palletStackPlacement(
      MACHINE_TYPES.workspace,
      { kind: "deck", index: 4 },
      "p:d4",
    );
    assert.notDeepStrictEqual(first, sibling);
    assert.ok(
      Math.hypot(first.xIn - sibling.xIn, first.yIn - sibling.yIn) < 2.5,
    );
  });

  it("keeps the pile on the top of the smallest bench there is", () => {
    // A 2'×2' worktable: 24" square, narrower than either board is long
    for (const target of [
      { kind: "deck", index: 0 } as const,
      { kind: "stringer", index: 0 } as const,
    ]) {
      const seat = palletStackPlacement(
        MACHINE_TYPES.worktable1x1,
        target,
        `small:${target.kind}`,
      );
      assert.ok(seat.xIn > 0 && seat.xIn < 24, `x was ${seat.xIn}`);
      assert.ok(seat.yIn > 0 && seat.yIn < 24, `y was ${seat.yIn}`);
    }
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
