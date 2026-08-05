import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { Board, FinishedProduct } from "../Materials";
import {
  assembleFromBlueprint,
  BIRDHOUSE_BLUEPRINT,
  blueprintFastenerCost,
  blueprintInputs,
  BOOKSHELF_BLUEPRINT,
  CRATE_BLUEPRINT,
  defaultPartsFor,
  fastenerToolId,
  matchPartsToSlots,
  PICTURE_FRAME_BLUEPRINT,
  PLANTER_BOX_BLUEPRINT,
  productBlueprintFor,
  RUSTIC_SHELF_BLUEPRINT,
  STEP_STOOL_BLUEPRINT,
  CROSSCUT_SLED_BLUEPRINT,
  MATERIAL_SHELF_BLUEPRINT,
  RESAW_FENCE_BLUEPRINT,
  STORAGE_RACK_BLUEPRINT,
  STRAIGHT_LINE_SLED_BLUEPRINT,
  TOOL_DRAWERS_BLUEPRINT,
  WORKTABLE_BLUEPRINTS,
} from "./blueprint";
import {
  armedFasteners,
  fastenedPieceIds,
  fastenerAt,
  seatedParts,
  slotOnBench,
  snapPlacementFor,
} from "./assembly";
import { BenchPlacement } from "./bench-layout";

const stringer = () => board("pallet", 48, 6, 6);
const deckBoard = () => board("pallet", 36, 4, 2);
const shelfParts = () => [
  stringer(),
  stringer(),
  deckBoard(),
  deckBoard(),
  deckBoard(),
];

/** The shelf frame centered on a 36×24 bench top. */
const centered: BenchPlacement = {
  xIn: 18,
  yIn: 12,
  angleDeg: 0,
  flipped: false,
};

/** Every piece lying exactly on its slot — tipped on edge where the
 * slot stands its part on edge (the rails). */
function allSeated(placement: BenchPlacement) {
  const pieces = shelfParts();
  return RUSTIC_SHELF_BLUEPRINT.slots.map((slot, i) => ({
    material: pieces[i],
    placement: {
      ...slotOnBench(RUSTIC_SHELF_BLUEPRINT, placement, slot),
      onEdge: slot.onEdge,
    },
  }));
}

describe("the rustic shelf blueprint", () => {
  it("derives one fastener per rail × shelf crossing", () => {
    assert.strictEqual(RUSTIC_SHELF_BLUEPRINT.fasteners.length, 6);
    // Every fastener joins a rail to a shelf — never rail/rail
    for (const fastener of RUSTIC_SHELF_BLUEPRINT.fasteners) {
      assert.ok(fastener.joins[0].startsWith("rail-"));
      assert.ok(fastener.joins[1].startsWith("shelf-"));
    }
  });

  it("puts the fasteners on the crossings", () => {
    const spots = RUSTIC_SHELF_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(
      spots,
      ["8,6", "24,6", "40,6", "8,30", "24,30", "40,30"].sort(),
    );
  });

  it("derives the recipe's inputs from the slots", () => {
    const inputs = blueprintInputs(RUSTIC_SHELF_BLUEPRINT);
    assert.strictEqual(inputs.length, 2);
    assert.strictEqual(inputs[0].quantity, 2);
    assert.deepStrictEqual(inputs[0].width, [6]);
    assert.strictEqual(inputs[1].quantity, 3);
    assert.deepStrictEqual(inputs[1].width, [4]);
  });

  it("bills one nail per fastener", () => {
    assert.deepStrictEqual(blueprintFastenerCost(RUSTIC_SHELF_BLUEPRINT), [
      { id: "nails", amount: 6 },
    ]);
  });

  it("is registered under its product type", () => {
    assert.strictEqual(
      productBlueprintFor("rusticShelf"),
      RUSTIC_SHELF_BLUEPRINT,
    );
    assert.strictEqual(productBlueprintFor("shelf"), null);
  });

  it("slot part dims agree with slot requirements", () => {
    for (const slot of RUSTIC_SHELF_BLUEPRINT.slots) {
      assert.deepStrictEqual(slot.requirement.width, [slot.part.widthIn]);
      assert.deepStrictEqual(slot.requirement.length, [slot.part.lengthIn]);
    }
  });
});

describe("assembleFromBlueprint", () => {
  it("matches rails and shelves to their slots and keeps their grain", () => {
    const materials = shelfParts();
    const matched = matchPartsToSlots(RUSTIC_SHELF_BLUEPRINT, materials);
    assert.strictEqual(matched[0].material, materials[0]);
    assert.strictEqual(matched[2].material, materials[2]);

    const product = assembleFromBlueprint(RUSTIC_SHELF_BLUEPRINT, materials);
    assert.strictEqual(product.type, "rusticShelf");
    assert.strictEqual(product.species, "pallet");
    assert.strictEqual(product.parts?.length, 5);
    // The consumed board's id IS the part's grain seed
    assert.strictEqual(product.parts?.[0].seed, materials[0].id);
    assert.strictEqual(product.parts?.[0].slot, "rail-0");
    assert.strictEqual(product.parts?.[4].slot, "shelf-2");
    assert.strictEqual(product.parts?.[4].width, 4);
  });

  it("refuses a load that can't fill every slot", () => {
    assert.throws(() =>
      matchPartsToSlots(RUSTIC_SHELF_BLUEPRINT, [
        stringer(),
        stringer(),
        deckBoard(),
      ]),
    );
  });

  it("stands in nominal parts for products from older saves", () => {
    const parts = defaultPartsFor(RUSTIC_SHELF_BLUEPRINT, {
      id: "old-shelf",
      type: "rusticShelf",
      species: "pallet",
    });
    assert.strictEqual(parts.length, 5);
    assert.strictEqual(parts[0].seed, "old-shelf:rail-0");
    assert.strictEqual(parts[0].thickness, 6);
  });
});

describe("seating and snapping", () => {
  it("sees every piece seated when each lies on its slot", () => {
    const seated = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      allSeated(centered),
    );
    assert.strictEqual(seated.size, 5);
  });

  it("seats through the product frame's turn", () => {
    const turned: BenchPlacement = { ...centered, angleDeg: 90 };
    const seated = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      turned,
      allSeated(turned),
    );
    assert.strictEqual(seated.size, 5);
  });

  it("accepts a board turned end for end (angle mod 180)", () => {
    const pieces = allSeated(centered).map((piece) => ({
      ...piece,
      placement: {
        ...piece.placement,
        angleDeg: piece.placement.angleDeg + 180,
      },
    }));
    const seated = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, pieces);
    assert.strictEqual(seated.size, 5);
  });

  it("does not seat a piece lying askew or off its slot", () => {
    const pieces = allSeated(centered);
    const askew = [
      { ...pieces[0], placement: { ...pieces[0].placement, angleDeg: 45 } },
      {
        ...pieces[1],
        placement: { ...pieces[1].placement, xIn: pieces[1].placement.xIn + 4 },
      },
      ...pieces.slice(2),
    ];
    const seated = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, askew);
    assert.strictEqual(seated.size, 3);
  });

  it("never seats a shelf board in a rail slot", () => {
    const railSlot = RUSTIC_SHELF_BLUEPRINT.slots[0];
    const impostor = {
      material: deckBoard(),
      placement: slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, railSlot),
    };
    const seated = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [impostor]);
    assert.strictEqual(seated.size, 0);
  });

  it("snaps a near, roughly aligned drop onto the empty slot", () => {
    const railSlot = RUSTIC_SHELF_BLUEPRINT.slots[0];
    const seat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, railSlot);
    const snap = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      stringer(),
      {
        xIn: seat.xIn + 3,
        yIn: seat.yIn - 2,
        angleDeg: 82,
        flipped: false,
        onEdge: true,
      },
      new Set(),
    );
    assert.ok(snap);
    assert.strictEqual(snap.slotId, "rail-0");
    assert.strictEqual(snap.placement.xIn, seat.xIn);
    assert.strictEqual(snap.placement.angleDeg, seat.angleDeg);
    assert.strictEqual(snap.placement.onEdge, true);
  });

  it("holds seating and snapping to the slot's orientation", () => {
    const railSlot = RUSTIC_SHELF_BLUEPRINT.slots[0];
    const seat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, railSlot);
    // A rail lying flat on its on-edge seat is not seated…
    const flat = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [
      { material: stringer(), placement: seat },
    ]);
    assert.strictEqual(flat.size, 0);
    // …and doesn't snap either, until it's tipped up (T)
    assert.strictEqual(
      snapPlacementFor(
        RUSTIC_SHELF_BLUEPRINT,
        centered,
        stringer(),
        seat,
        new Set(),
      ),
      null,
    );
    const tipped = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [
      { material: stringer(), placement: { ...seat, onEdge: true } },
    ]);
    assert.strictEqual(tipped.size, 1);
    // A shelf board tipped on edge over its flat slot won't seat there
    const shelfSlot = RUSTIC_SHELF_BLUEPRINT.slots[2];
    const shelfSeat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, shelfSlot);
    const edgyShelf = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [
      {
        material: deckBoard(),
        placement: { ...shelfSeat, onEdge: true },
      },
    ]);
    assert.strictEqual(edgyShelf.size, 0);
  });

  it("keeps the accumulated turn: a 270° board seats without unwinding", () => {
    const railSlot = RUSTIC_SHELF_BLUEPRINT.slots[0];
    const seat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, railSlot);
    const snap = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      stringer(),
      {
        xIn: seat.xIn,
        yIn: seat.yIn,
        angleDeg: 270,
        flipped: false,
        onEdge: true,
      },
      new Set(),
    );
    assert.ok(snap);
    assert.strictEqual(snap.placement.angleDeg, 270);
  });

  it("refuses a drop that is too far, misaligned, or already taken", () => {
    const railSlot = RUSTIC_SHELF_BLUEPRINT.slots[0];
    const seat = {
      ...slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, railSlot),
      onEdge: true,
    };
    const far = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      stringer(),
      { ...seat, xIn: seat.xIn + 20, yIn: 60 },
      new Set(),
    );
    // 20in right of rail-0's seat could still be near rail-1; push well away
    assert.strictEqual(far, null);
    const askew = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      stringer(),
      { ...seat, angleDeg: seat.angleDeg + 50 },
      new Set(),
    );
    assert.strictEqual(askew, null);
    const taken = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      stringer(),
      seat,
      new Set(["rail-0", "rail-1"]),
    );
    assert.strictEqual(taken, null);
  });

  it("arms a fastener only when both its parts are seated", () => {
    const pieces = allSeated(centered);
    // Rails only: nothing to nail yet
    const railsOnly = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      pieces.slice(0, 2),
    );
    assert.strictEqual(
      armedFasteners(RUSTIC_SHELF_BLUEPRINT, railsOnly).length,
      0,
    );
    // Rails + one shelf: that shelf's two crossings arm
    const oneShelf = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      pieces.slice(0, 3),
    );
    assert.strictEqual(
      armedFasteners(RUSTIC_SHELF_BLUEPRINT, oneShelf).length,
      2,
    );
    const all = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, pieces);
    assert.strictEqual(armedFasteners(RUSTIC_SHELF_BLUEPRINT, all).length, 6);
  });

  it("finds the nearest armed fastener under the pointer, through a turn", () => {
    const turned: BenchPlacement = { ...centered, angleDeg: 90 };
    const seated = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      turned,
      allSeated(turned),
    );
    const armed = armedFasteners(RUSTIC_SHELF_BLUEPRINT, seated);
    const target = armed[0];
    const at = fastenerOnBenchForTest(turned, target);
    const hit = fastenerAt(
      RUSTIC_SHELF_BLUEPRINT,
      turned,
      armed,
      at.xIn + 1,
      at.yIn - 1,
    );
    assert.strictEqual(hit, target);
    const miss = fastenerAt(
      RUSTIC_SHELF_BLUEPRINT,
      turned,
      armed,
      at.xIn + 30,
      at.yIn + 30,
    );
    assert.notStrictEqual(miss, target);
  });

  it("locks the pieces a driven fastener already holds", () => {
    const pieces = allSeated(centered);
    const seated = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, pieces);
    const armed = armedFasteners(RUSTIC_SHELF_BLUEPRINT, seated);
    const locked = fastenedPieceIds(seated, [armed[0]]);
    assert.strictEqual(locked.size, 2);
    assert.ok(locked.has(seated.get(armed[0].joins[0])!));
    assert.ok(locked.has(seated.get(armed[0].joins[1])!));
  });
});

// Small local wrapper so the turn test reads at a glance.
import { fastenerOnBench } from "./assembly";
import type { BlueprintFastener } from "./blueprint";
function fastenerOnBenchForTest(
  placement: BenchPlacement,
  fastener: BlueprintFastener,
) {
  return fastenerOnBench(RUSTIC_SHELF_BLUEPRINT, placement, fastener);
}

describe("the crate and planter box blueprints", () => {
  it("derives the crate's sixteen nails: four lapped corners, twelve slat crossings", () => {
    assert.deepStrictEqual(blueprintFastenerCost(CRATE_BLUEPRINT), [
      { id: "nails", amount: 16 },
    ]);
    const spots = CRATE_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(
      spots,
      [
        // Each of the six bottom slats crossing the lower pair of walls
        ...[3, 9, 15, 21, 27, 33].flatMap((x) => [`${x},2`, `${x},34`]),
        // The lapped corners, where neighboring walls cross
        "2,2",
        "34,2",
        "2,34",
        "34,34",
      ].sort(),
    );
  });

  it("derives the planter's six screws", () => {
    assert.deepStrictEqual(blueprintFastenerCost(PLANTER_BOX_BLUEPRINT), [
      { id: "screws", amount: 6 },
    ]);
    const spots = PLANTER_BOX_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(
      spots,
      ["12,2", "12,22", "2,2", "22,2", "2,22", "22,22"].sort(),
    );
  });

  it("folds each box's identical stock to one input row", () => {
    const crateInputs = blueprintInputs(CRATE_BLUEPRINT);
    assert.strictEqual(crateInputs.length, 1);
    assert.strictEqual(crateInputs[0].quantity, 10);
    const planterInputs = blueprintInputs(PLANTER_BOX_BLUEPRINT);
    assert.strictEqual(planterInputs.length, 1);
    assert.strictEqual(planterInputs[0].quantity, 5);
  });

  it("stands all four walls on edge and lies the slats flat", () => {
    for (const blueprint of [CRATE_BLUEPRINT, PLANTER_BOX_BLUEPRINT]) {
      const walls = blueprint.slots.filter((s) => s.role === "wall");
      assert.strictEqual(walls.length, 4);
      assert.ok(walls.every((w) => w.onEdge));
      assert.ok(
        blueprint.slots
          .filter((s) => s.role === "slat")
          .every((s) => !s.onEdge),
      );
    }
  });

  it("is registered under its product type and carries its parts", () => {
    assert.strictEqual(productBlueprintFor("crate"), CRATE_BLUEPRINT);
    assert.strictEqual(
      productBlueprintFor("planterBox"),
      PLANTER_BOX_BLUEPRINT,
    );
    const crate = assembleFromBlueprint(
      CRATE_BLUEPRINT,
      Array.from({ length: 10 }, () => board("pallet", 36, 4, 2)),
    );
    assert.strictEqual(crate.type, "crate");
    assert.strictEqual(crate.parts?.length, 10);
  });

  it("maps each fastener to its driver: nails the hammer, screws the drill", () => {
    assert.strictEqual(fastenerToolId("nails"), "hammer");
    assert.strictEqual(fastenerToolId("screws"), "drill");
    assert.strictEqual(
      fastenerToolId(CRATE_BLUEPRINT.fastenerConsumable),
      "hammer",
    );
    assert.strictEqual(
      fastenerToolId(PLANTER_BOX_BLUEPRINT.fastenerConsumable),
      "drill",
    );
  });
});

describe("the step stool and bookshelf blueprints", () => {
  it("screws each tread to both sides: four joints, four screws", () => {
    assert.deepStrictEqual(blueprintFastenerCost(STEP_STOOL_BLUEPRINT), [
      { id: "screws", amount: 4 },
    ]);
    const spots = STEP_STOOL_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(spots, ["2,4", "22,4", "2,14", "22,14"].sort());
  });

  it("screws each shelf to both sides at thirds", () => {
    assert.deepStrictEqual(blueprintFastenerCost(BOOKSHELF_BLUEPRINT), [
      { id: "screws", amount: 4 },
    ]);
    const spots = BOOKSHELF_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(spots, ["2,12", "46,12", "2,36", "46,36"].sort());
  });

  it("derives the recipes' inputs: two-and-two stock, or one folded row", () => {
    const stoolInputs = blueprintInputs(STEP_STOOL_BLUEPRINT);
    assert.strictEqual(stoolInputs.length, 2);
    assert.deepStrictEqual(
      stoolInputs.map((row) => row.quantity),
      [2, 2],
    );
    // All four bookshelf boards are the same sanded hardwood
    const shelfInputs = blueprintInputs(BOOKSHELF_BLUEPRINT);
    assert.strictEqual(shelfInputs.length, 1);
    assert.strictEqual(shelfInputs[0].quantity, 4);
    assert.deepStrictEqual(shelfInputs[0].surface, ["sanded"]);
  });

  it("stands the sides on edge and lies the treads and shelves flat", () => {
    for (const blueprint of [STEP_STOOL_BLUEPRINT, BOOKSHELF_BLUEPRINT]) {
      const sides = blueprint.slots.filter((s) => s.role === "side");
      assert.strictEqual(sides.length, 2);
      assert.ok(sides.every((s) => s.onEdge));
      assert.ok(
        blueprint.slots
          .filter((s) => s.role !== "side")
          .every((s) => !s.onEdge),
      );
    }
  });

  it("is registered and keeps a sanded board sanded in the finished piece", () => {
    assert.strictEqual(productBlueprintFor("stepStool"), STEP_STOOL_BLUEPRINT);
    assert.strictEqual(productBlueprintFor("bookshelf"), BOOKSHELF_BLUEPRINT);
    const stool = assembleFromBlueprint(STEP_STOOL_BLUEPRINT, [
      board("pallet", 24, 6, 6),
      board("pallet", 24, 6, 6),
      board("pallet", 24, 4, 2),
      board("pallet", 24, 4, 2),
    ]);
    assert.strictEqual(stool.type, "stepStool");
    assert.strictEqual(stool.parts?.length, 4);
    const bookshelf = assembleFromBlueprint(
      BOOKSHELF_BLUEPRINT,
      Array.from({ length: 4 }, () => board("oak", 48, 6, 4, "sanded")),
    );
    assert.strictEqual(bookshelf.species, "oak");
    assert.ok(bookshelf.parts?.every((part) => part.surface === "sanded"));
  });
});

describe("the birdhouse blueprint", () => {
  it("derives six nails: front to side, front through floor, roof into front", () => {
    assert.deepStrictEqual(blueprintFastenerCost(BIRDHOUSE_BLUEPRINT), [
      { id: "nails", amount: 6 },
    ]);
    const spots = BIRDHOUSE_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(
      spots,
      [
        // Each front board into its side wall
        "3.25,13",
        "11.75,13",
        // Each front board through the floor strip
        "5,15.75",
        "10,15.75",
        // The roof down into each front board's mitered top
        "5,5.25",
        "10,5.25",
      ].sort(),
    );
    // The roof never nails into the sides — the ventilation gaps are open
    for (const fastener of BIRDHOUSE_BLUEPRINT.fasteners) {
      assert.ok(
        !(
          fastener.joins.some((id) => id.startsWith("roof")) &&
          fastener.joins.some((id) => id.startsWith("side"))
        ),
      );
    }
  });

  it("folds the recipe to four rows: fronts, roof, sides, floor", () => {
    const inputs = blueprintInputs(BIRDHOUSE_BLUEPRINT);
    assert.deepStrictEqual(
      inputs.map((row) => row.quantity),
      [2, 1, 2, 1],
    );
    // The mitered fronts read their predicate's note on the sheet
    assert.strictEqual(inputs[0].matchesNote, "one end mitered 45°");
  });

  it("lies the roof flat on the slope and stands the flanks on edge", () => {
    const roof = BIRDHOUSE_BLUEPRINT.slots.find((s) => s.role === "roof");
    assert.ok(roof && !roof.onEdge);
    assert.ok(
      BIRDHOUSE_BLUEPRINT.slots
        .filter((s) => s.role === "side" || s.role === "floor")
        .every((s) => s.onEdge),
    );
  });

  it("is registered and assembles from its six boards", () => {
    assert.strictEqual(productBlueprintFor("birdhouse"), BIRDHOUSE_BLUEPRINT);
    const mitered = () =>
      makeMaterial<Board>({
        ...board("pallet", 12, 4, 2),
        ends: {
          left: { kind: "square" },
          right: { kind: "mitered", angle: -45 },
        },
      });
    const birdhouse = assembleFromBlueprint(BIRDHOUSE_BLUEPRINT, [
      mitered(),
      mitered(),
      board("pallet", 12, 6, 6),
      board("pallet", 6, 4, 2),
      board("pallet", 6, 4, 2),
      board("pallet", 12, 4, 2),
    ]);
    assert.strictEqual(birdhouse.type, "birdhouse");
    assert.strictEqual(birdhouse.parts?.length, 6);
  });
});

describe("the picture frame blueprint", () => {
  const NOMINAL_ENDS = {
    left: { kind: "mitered", angle: -45 },
    right: { kind: "mitered", angle: 45 },
  } as const;
  const rail = (ends: Board["ends"] = NOMINAL_ENDS) =>
    makeMaterial<Board>({
      ...board("walnut", 24, 1, 1, "sanded"),
      ends,
    });

  it("derives four brads, one at each 1×1 corner lap", () => {
    assert.deepStrictEqual(blueprintFastenerCost(PICTURE_FRAME_BLUEPRINT), [
      { id: "nails", amount: 4 },
    ]);
    const spots = PICTURE_FRAME_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(
      spots,
      ["0.5,0.5", "23.5,0.5", "0.5,23.5", "23.5,23.5"].sort(),
    );
    // Every brad joins one horizontal rail to one vertical rail — the
    // same-layer pairs never earn one
    for (const fastener of PICTURE_FRAME_BLUEPRINT.fasteners) {
      const [lower, upper] = fastener.joins;
      assert.ok(["rail-0", "rail-1"].includes(lower));
      assert.ok(["rail-2", "rail-3"].includes(upper));
    }
  });

  it("folds the sheet to one row: four rails, mirrored miters noted", () => {
    const inputs = blueprintInputs(PICTURE_FRAME_BLUEPRINT);
    assert.strictEqual(inputs.length, 1);
    assert.strictEqual(inputs[0].quantity, 4);
    assert.deepStrictEqual(inputs[0].length, [24]);
    assert.deepStrictEqual(inputs[0].width, [1]);
    assert.deepStrictEqual(inputs[0].thickness, [1]);
    assert.deepStrictEqual(inputs[0].surface, ["sanded"]);
    assert.strictEqual(inputs[0].matchesNote, "45° both ends, mirrored");
    // The predicate survives the fold: a rail passes, square stock and a
    // parallelogram don't
    assert.ok(inputs[0].matches!(rail()));
    assert.ok(!inputs[0].matches!(board("walnut", 24, 1, 1, "sanded")));
    assert.ok(
      !inputs[0].matches!(
        rail({
          left: { kind: "mitered", angle: 45 },
          right: { kind: "mitered", angle: 45 },
        }),
      ),
    );
  });

  it("is registered and assembles four rails into a frame with its ends", () => {
    assert.strictEqual(
      productBlueprintFor("pictureFrame"),
      PICTURE_FRAME_BLUEPRINT,
    );
    const frame = assembleFromBlueprint(PICTURE_FRAME_BLUEPRINT, [
      rail(),
      rail(),
      rail(),
      rail(),
    ]);
    assert.strictEqual(frame.type, "pictureFrame");
    assert.strictEqual(frame.species, "walnut");
    assert.strictEqual(frame.parts?.length, 4);
    for (const part of frame.parts!) {
      assert.deepStrictEqual(part.ends, NOMINAL_ENDS);
    }
  });

  it("turns a rail cut with the other swing over to seat long edge out", () => {
    // The same physical rail, recorded off the opposite pair of stops:
    // flipping it over negates both ends, which is free — the part lands
    // in the slot's nominal orientation so the corners close
    const flipped = rail({
      left: { kind: "mitered", angle: 45 },
      right: { kind: "mitered", angle: -45 },
    });
    const frame = assembleFromBlueprint(PICTURE_FRAME_BLUEPRINT, [
      flipped,
      rail(),
      rail(),
      rail(),
    ]);
    for (const part of frame.parts!) {
      assert.deepStrictEqual(part.ends, NOMINAL_ENDS);
    }
  });

  it("synthesizes mirrored miters on frames from older saves", () => {
    const legacyFrame = makeMaterial<FinishedProduct>({
      type: "pictureFrame",
      species: "cherry",
    });
    const parts = defaultPartsFor(PICTURE_FRAME_BLUEPRINT, legacyFrame);
    assert.strictEqual(parts.length, 4);
    for (const part of parts) {
      assert.deepStrictEqual(part.ends, NOMINAL_ENDS);
      assert.strictEqual(part.surface, "sanded");
    }
  });
});

describe("equipment blueprints", () => {
  it("derives each build's inputs in the legacy recipe's shape", () => {
    const rows = blueprintInputs(WORKTABLE_BLUEPRINTS.worktable1x2);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows[0].type, ["plywood"]);
    assert.strictEqual(rows[0].quantity, 1);
    assert.deepStrictEqual(rows[1].type, ["board"]);
    assert.strictEqual(rows[1].quantity, 4);
    assert.deepStrictEqual(rows[1].thickness, [6, 8]);
  });

  it("nails every sheet–rail seam and rail–stretcher crossing", () => {
    assert.strictEqual(WORKTABLE_BLUEPRINTS.worktable1x1.fasteners.length, 4);
    assert.strictEqual(WORKTABLE_BLUEPRINTS.worktable1x2.fasteners.length, 6);
    assert.strictEqual(WORKTABLE_BLUEPRINTS.worktable1x3.fasteners.length, 8);
    assert.strictEqual(WORKTABLE_BLUEPRINTS.worktable2x2.fasteners.length, 11);
    assert.strictEqual(STORAGE_RACK_BLUEPRINT.fasteners.length, 6);
    assert.strictEqual(TOOL_DRAWERS_BLUEPRINT.fasteners.length, 2);
  });

  it("the material shelf has no fasteners at all — laying on is the build", () => {
    assert.strictEqual(MATERIAL_SHELF_BLUEPRINT.fasteners.length, 0);
    assert.deepStrictEqual(blueprintFastenerCost(MATERIAL_SHELF_BLUEPRINT), []);
  });

  it("the jigs are screwed, two seams each", () => {
    for (const jig of [
      CROSSCUT_SLED_BLUEPRINT,
      STRAIGHT_LINE_SLED_BLUEPRINT,
      RESAW_FENCE_BLUEPRINT,
    ]) {
      assert.strictEqual(jig.fastenerConsumable, "screws");
      assert.strictEqual(jig.fasteners.length, 2);
    }
  });

  it("is registered under its equipment id and never becomes a product", () => {
    assert.strictEqual(
      productBlueprintFor("worktable1x1"),
      WORKTABLE_BLUEPRINTS.worktable1x1,
    );
    assert.strictEqual(
      WORKTABLE_BLUEPRINTS.worktable1x1.productType,
      undefined,
    );
    assert.throws(
      () => assembleFromBlueprint(STORAGE_RACK_BLUEPRINT, []),
      /builds equipment, not a product/,
    );
  });
});
