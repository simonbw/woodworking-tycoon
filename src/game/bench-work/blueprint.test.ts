import assert from "node:assert";
import { describe, it } from "node:test";
import { array } from "../../utils/arrayUtils";
import { board, palletBoard } from "../board-helpers";
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
  ProductBlueprint,
  RUSTIC_FRAME_BLUEPRINT,
  RUSTIC_SHELF_BLUEPRINT,
  STEP_STOOL_BLUEPRINT,
  CROSSCUT_SLED_BLUEPRINT,
  HEX_FRAME_BLUEPRINT,
  MATERIAL_SHELF_BLUEPRINT,
  RESAW_FENCE_BLUEPRINT,
  SERVING_TRAY_BLUEPRINT,
  SHELF_BLUEPRINT,
  SIDE_TABLE_BLUEPRINT,
  slotExtent,
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

/** Six identical pallet boards — the shelf's whole bill of materials. */
const shelfParts = () =>
  array(RUSTIC_SHELF_BLUEPRINT.slots.length).map(palletBoard);

/** The slots by role, in declaration order: supports flat on the bench,
 * then the sides on edge, then the shelves on edge. Every slot takes the
 * same board, so orientation is the only thing that tells them apart. */
const SUPPORT_SLOT = 0;
const SHELF_SLOT = 4;

/** The shelf frame centered on a 36×24 bench top. */
const centered: BenchPlacement = {
  xIn: 18,
  yIn: 12,
  angleDeg: 0,
  flipped: false,
};

/** Every piece lying exactly on its slot — tipped on edge where the
 * slot stands its part on edge (the sides and shelves). */
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
  it("nails every shelf and support to both sides — eight, driven from the sides", () => {
    assert.strictEqual(RUSTIC_SHELF_BLUEPRINT.fasteners.length, 8);
    // Every nail goes through a side and into the end of something else
    for (const fastener of RUSTIC_SHELF_BLUEPRINT.fasteners) {
      const [lower, upper] = fastener.joins;
      assert.strictEqual(
        [lower, upper].filter((id) => id.startsWith("side-")).length,
        1,
      );
      assert.ok(
        lower.startsWith("support-") || upper.startsWith("shelf-"),
        `${lower} → ${upper} joins neither a support nor a shelf`,
      );
    }
  });

  it("puts the fasteners where the sides meet the ends", () => {
    const spots = RUSTIC_SHELF_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(
      spots,
      [
        // Each side, at both shelf boards…
        "0.5,12",
        "35.5,12",
        "0.5,30",
        "35.5,30",
        // …and at both supports, tucked just under them
        "0.5,14.5",
        "35.5,14.5",
        "0.5,32.5",
        "35.5,32.5",
      ].sort(),
    );
  });

  it("derives the recipe's inputs from the slots — one stock, six of it", () => {
    const inputs = blueprintInputs(RUSTIC_SHELF_BLUEPRINT);
    assert.strictEqual(inputs.length, 1);
    assert.strictEqual(inputs[0].quantity, 6);
    assert.deepStrictEqual(inputs[0].width, [4]);
    assert.deepStrictEqual(inputs[0].length, [36]);
    assert.deepStrictEqual(inputs[0].thickness, [4]);
  });

  it("bills one nail per fastener", () => {
    assert.deepStrictEqual(blueprintFastenerCost(RUSTIC_SHELF_BLUEPRINT), [
      { id: "nails", amount: 8 },
    ]);
  });

  it("is registered under its product type", () => {
    assert.strictEqual(
      productBlueprintFor("rusticShelf"),
      RUSTIC_SHELF_BLUEPRINT,
    );
    // Every product carries a blueprint now — the registry has no holes
    assert.ok(productBlueprintFor("jewelryBox"));
    assert.strictEqual(productBlueprintFor("nonsense"), null);
  });

  it("slot part dims agree with slot requirements", () => {
    for (const slot of RUSTIC_SHELF_BLUEPRINT.slots) {
      assert.deepStrictEqual(slot.requirement.width, [slot.part.widthIn]);
      assert.deepStrictEqual(slot.requirement.length, [slot.part.lengthIn]);
    }
  });
});

describe("assembleFromBlueprint", () => {
  it("matches the boards to their slots and keeps their grain", () => {
    const materials = shelfParts();
    const matched = matchPartsToSlots(RUSTIC_SHELF_BLUEPRINT, materials);
    assert.strictEqual(matched[0].material, materials[0]);
    assert.strictEqual(matched[2].material, materials[2]);

    const product = assembleFromBlueprint(RUSTIC_SHELF_BLUEPRINT, materials);
    assert.strictEqual(product.type, "rusticShelf");
    assert.strictEqual(product.species, "pallet");
    assert.strictEqual(product.parts?.length, 6);
    // The consumed board's id IS the part's grain seed
    assert.strictEqual(product.parts?.[0].seed, materials[0].id);
    assert.strictEqual(product.parts?.[0].slot, "support-0");
    assert.strictEqual(product.parts?.[5].slot, "shelf-1");
    assert.strictEqual(product.parts?.[5].width, 4);
  });

  it("refuses a load that can't fill every slot", () => {
    assert.throws(() =>
      matchPartsToSlots(RUSTIC_SHELF_BLUEPRINT, [
        palletBoard(),
        palletBoard(),
        palletBoard(),
      ]),
    );
  });

  it("stands in nominal parts for products from older saves", () => {
    const parts = defaultPartsFor(RUSTIC_SHELF_BLUEPRINT, {
      id: "old-shelf",
      type: "rusticShelf",
      species: "pallet",
    });
    assert.strictEqual(parts.length, 6);
    assert.strictEqual(parts[0].seed, "old-shelf:support-0");
    assert.strictEqual(parts[0].thickness, 4);
  });
});

describe("seating and snapping", () => {
  it("sees every piece seated when each lies on its slot", () => {
    const seated = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      allSeated(centered),
    );
    assert.strictEqual(seated.size, 6);
  });

  it("seats through the product frame's turn", () => {
    const turned: BenchPlacement = { ...centered, angleDeg: 90 };
    const seated = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      turned,
      allSeated(turned),
    );
    assert.strictEqual(seated.size, 6);
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
    assert.strictEqual(seated.size, 6);
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
    assert.strictEqual(seated.size, 4);
  });

  it("never seats stock a slot's requirement refuses", () => {
    // The step stool wants 6/4 or heavier for its sides; a tread-sized
    // board lying right on the seat is still the wrong stock.
    const sideSlot = STEP_STOOL_BLUEPRINT.slots[0];
    const impostor = {
      material: board("oak", 24, 4, 2),
      placement: slotOnBench(STEP_STOOL_BLUEPRINT, centered, sideSlot),
    };
    const seated = seatedParts(STEP_STOOL_BLUEPRINT, centered, [impostor]);
    assert.strictEqual(seated.size, 0);
  });

  it("snaps a near, roughly aligned drop onto the empty slot", () => {
    const shelfSlot = RUSTIC_SHELF_BLUEPRINT.slots[SHELF_SLOT];
    const seat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, shelfSlot);
    const snap = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      palletBoard(),
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
    assert.strictEqual(snap.slotId, "shelf-0");
    assert.strictEqual(snap.placement.xIn, seat.xIn);
    assert.strictEqual(snap.placement.angleDeg, seat.angleDeg);
    assert.strictEqual(snap.placement.onEdge, true);
  });

  it("holds seating and snapping to the slot's orientation", () => {
    const shelfSlot = RUSTIC_SHELF_BLUEPRINT.slots[SHELF_SLOT];
    const seat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, shelfSlot);
    // A shelf board lying flat on its on-edge seat is not seated…
    const flat = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [
      { material: palletBoard(), placement: seat },
    ]);
    assert.strictEqual(flat.size, 0);
    // …and doesn't snap either, until it's tipped up (T). The supports
    // are spoken for: they're the only flat slots, and one sits close
    // enough behind this shelf to catch a board lying down.
    assert.strictEqual(
      snapPlacementFor(
        RUSTIC_SHELF_BLUEPRINT,
        centered,
        palletBoard(),
        seat,
        new Set(["support-0", "support-1"]),
      ),
      null,
    );
    const tipped = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [
      { material: palletBoard(), placement: { ...seat, onEdge: true } },
    ]);
    assert.strictEqual(tipped.size, 1);
    // And the same board tipped on edge over a flat slot won't seat there
    const supportSlot = RUSTIC_SHELF_BLUEPRINT.slots[SUPPORT_SLOT];
    const supportSeat = slotOnBench(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      supportSlot,
    );
    const edgySupport = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, [
      {
        material: palletBoard(),
        placement: { ...supportSeat, onEdge: true },
      },
    ]);
    assert.strictEqual(edgySupport.size, 0);
  });

  it("keeps the accumulated turn: a 270° board seats without unwinding", () => {
    const shelfSlot = RUSTIC_SHELF_BLUEPRINT.slots[SHELF_SLOT];
    const seat = slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, shelfSlot);
    const snap = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      palletBoard(),
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
    const shelfSlot = RUSTIC_SHELF_BLUEPRINT.slots[SHELF_SLOT];
    const seat = {
      ...slotOnBench(RUSTIC_SHELF_BLUEPRINT, centered, shelfSlot),
      onEdge: true,
    };
    const far = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      palletBoard(),
      { ...seat, xIn: seat.xIn + 20, yIn: 60 },
      new Set(),
    );
    // 20in off shelf-0's seat could still be near shelf-1; push well away
    assert.strictEqual(far, null);
    const askew = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      palletBoard(),
      { ...seat, angleDeg: seat.angleDeg + 50 },
      new Set(),
    );
    assert.strictEqual(askew, null);
    // With both shelf slots taken, the sides and supports are the only
    // empties left — and neither will take a board in this orientation.
    const taken = snapPlacementFor(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      palletBoard(),
      seat,
      new Set(["shelf-0", "shelf-1"]),
    );
    assert.strictEqual(taken, null);
  });

  it("arms a fastener only when both its parts are seated", () => {
    const pieces = allSeated(centered);
    // Supports only: no side to nail through yet
    const supportsOnly = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      pieces.slice(0, 2),
    );
    assert.strictEqual(
      armedFasteners(RUSTIC_SHELF_BLUEPRINT, supportsOnly).length,
      0,
    );
    // Supports + one side: that side's nail into each support arms
    const oneSide = seatedParts(
      RUSTIC_SHELF_BLUEPRINT,
      centered,
      pieces.slice(0, 3),
    );
    assert.strictEqual(
      armedFasteners(RUSTIC_SHELF_BLUEPRINT, oneSide).length,
      2,
    );
    const all = seatedParts(RUSTIC_SHELF_BLUEPRINT, centered, pieces);
    assert.strictEqual(armedFasteners(RUSTIC_SHELF_BLUEPRINT, all).length, 8);
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
      Array.from({ length: 10 }, palletBoard),
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
        "3.5,13",
        "11.5,13",
        // Each front board through the floor strip
        "5,15.5",
        "10,15.5",
        // The roof down into each front board's mitered top
        "5,4.75",
        "10,4.75",
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
    // Every part is a crosscut of the same 4"×4/4 pallet board
    const mitered = () =>
      makeMaterial<Board>({
        ...board("pallet", 12, 4, 4),
        ends: {
          left: { kind: "square" },
          right: { kind: "mitered", angle: -45 },
        },
      });
    const birdhouse = assembleFromBlueprint(BIRDHOUSE_BLUEPRINT, [
      mitered(),
      mitered(),
      board("pallet", 12, 4, 4),
      board("pallet", 6, 4, 4),
      board("pallet", 6, 4, 4),
      board("pallet", 12, 4, 4),
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

describe("the rustic frame blueprint", () => {
  const NOMINAL_ENDS = {
    left: { kind: "mitered", angle: -45 },
    right: { kind: "mitered", angle: 45 },
  } as const;
  const rail = (length: number) =>
    makeMaterial<Board>({
      ...board("pallet", length, 2, 4, "sanded"),
      ends: NOMINAL_ENDS,
    });

  it("derives four nails, one at each 2×2 corner lap", () => {
    assert.deepStrictEqual(blueprintFastenerCost(RUSTIC_FRAME_BLUEPRINT), [
      { id: "nails", amount: 4 },
    ]);
    const spots = RUSTIC_FRAME_BLUEPRINT.fasteners
      .map((f) => `${f.xIn},${f.yIn}`)
      .sort();
    assert.deepStrictEqual(spots, ["1,1", "11,1", "1,23", "11,23"].sort());
  });

  it("folds the sheet to two rows: two long rails, two short", () => {
    const inputs = blueprintInputs(RUSTIC_FRAME_BLUEPRINT);
    assert.strictEqual(inputs.length, 2);
    assert.strictEqual(inputs[0].quantity, 2);
    assert.deepStrictEqual(inputs[0].length, [24]);
    assert.strictEqual(inputs[1].quantity, 2);
    assert.deepStrictEqual(inputs[1].length, [12]);
    for (const row of inputs) {
      assert.deepStrictEqual(row.species, ["pallet"]);
      assert.deepStrictEqual(row.width, [2]);
      assert.deepStrictEqual(row.surface, ["sanded"]);
      assert.strictEqual(row.matchesNote, "45° both ends, mirrored");
      // Square-ended stock is not a rail, however well milled
      assert.ok(!row.matches!(board("pallet", 24, 2, 4, "sanded")));
    }
  });

  it("is registered and assembles two lengths into one frame", () => {
    assert.strictEqual(
      productBlueprintFor("rusticFrame"),
      RUSTIC_FRAME_BLUEPRINT,
    );
    const frame = assembleFromBlueprint(RUSTIC_FRAME_BLUEPRINT, [
      rail(24),
      rail(24),
      rail(12),
      rail(12),
    ]);
    assert.strictEqual(frame.type, "rusticFrame");
    assert.strictEqual(frame.species, "pallet");
    assert.strictEqual(frame.parts?.length, 4);
    assert.deepStrictEqual(
      frame.parts!.map((p) => p.length).sort((a, b) => a - b),
      [12, 12, 24, 24],
    );
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

  it("nails every seam by the spacing rule — a row per long joint", () => {
    assert.strictEqual(WORKTABLE_BLUEPRINTS.worktable1x1.fasteners.length, 6);
    assert.strictEqual(WORKTABLE_BLUEPRINTS.worktable1x2.fasteners.length, 10);
    assert.strictEqual(STORAGE_RACK_BLUEPRINT.fasteners.length, 8);
    assert.strictEqual(TOOL_DRAWERS_BLUEPRINT.fasteners.length, 4);
  });

  it("decks each table in panels the store actually sells", () => {
    // The tops are the machine's own footprint, so the bigger bench is a
    // bigger buy
    const topOf = (blueprint: ProductBlueprint) =>
      blueprint.slots
        .filter((slot) => slot.role === "top")
        .map((slot) => [slot.part.lengthIn, slot.part.widthIn]);
    assert.deepStrictEqual(topOf(WORKTABLE_BLUEPRINTS.worktable1x1), [
      [24, 24],
    ]);
    assert.deepStrictEqual(topOf(WORKTABLE_BLUEPRINTS.worktable1x2), [
      [24, 48],
    ]);
  });

  it("the material shelf has no fasteners at all — laying on is the build", () => {
    assert.strictEqual(MATERIAL_SHELF_BLUEPRINT.fasteners.length, 0);
    assert.deepStrictEqual(blueprintFastenerCost(MATERIAL_SHELF_BLUEPRINT), []);
  });

  it("the jigs are screwed", () => {
    for (const jig of [
      CROSSCUT_SLED_BLUEPRINT,
      STRAIGHT_LINE_SLED_BLUEPRINT,
      RESAW_FENCE_BLUEPRINT,
    ]) {
      assert.strictEqual(jig.fastenerConsumable, "screws");
    }
    // The sleds' runner and fence seams take a screw or two each;
    // the resaw fence's short braces take one
    assert.strictEqual(CROSSCUT_SLED_BLUEPRINT.fasteners.length, 3);
    assert.strictEqual(STRAIGHT_LINE_SLED_BLUEPRINT.fasteners.length, 4);
    assert.strictEqual(RESAW_FENCE_BLUEPRINT.fasteners.length, 2);
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

describe("the shelf blueprint", () => {
  it("screws the cleat down the length of the seam, not once at its middle", () => {
    assert.strictEqual(SHELF_BLUEPRINT.fasteners.length, 3);
    assert.deepStrictEqual(
      SHELF_BLUEPRINT.fasteners.map((f) => f.xIn),
      [8, 24, 40],
    );
    assert.deepStrictEqual(blueprintFastenerCost(SHELF_BLUEPRINT), [
      { id: "screws", amount: 3 },
    ]);
  });

  it("derives the legacy recipe's two-board bill", () => {
    const rows = blueprintInputs(SHELF_BLUEPRINT);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].quantity, 2);
    assert.deepStrictEqual(rows[0].surface, ["sanded"]);
  });

  it("builds a shelf carrying the very boards that went in", () => {
    const oak = () => board("oak", 48, 6, 4, "sanded");
    const product = assembleFromBlueprint(SHELF_BLUEPRINT, [oak(), oak()]);
    assert.strictEqual(product.type, "shelf");
    assert.strictEqual(product.species, "oak");
    assert.strictEqual(product.parts?.length, 2);
    assert.ok(productBlueprintFor("shelf"));
  });
});

describe("the serving tray blueprint", () => {
  const strips = Array.from({ length: 6 }, () => ({
    species: "maple" as const,
    width: 2 as const,
  }));

  it("screws the long seams twice each and brads the four corner laps", () => {
    assert.strictEqual(SERVING_TRAY_BLUEPRINT.fasteners.length, 8);
    const corners = SERVING_TRAY_BLUEPRINT.fasteners.filter((f) =>
      f.joins.every(
        (slot) => slot.startsWith("rail") || slot.startsWith("end"),
      ),
    );
    assert.strictEqual(corners.length, 4);
  });

  it("assembles a tray whose bottom part keeps its strips", () => {
    const bottom = makeMaterial({
      type: "panel",
      strips,
      length: 24,
      thickness: 4,
      surface: "sanded",
    } as never);
    const rail = (length: number) =>
      makeMaterial({
        ...board("maple", length, 1, 1, "sanded"),
        ends: {
          left: { kind: "mitered", angle: -45 },
          right: { kind: "mitered", angle: 45 },
        },
      } as never);
    const tray = assembleFromBlueprint(SERVING_TRAY_BLUEPRINT, [
      bottom,
      rail(24),
      rail(24),
      rail(12),
      rail(12),
    ]);
    assert.strictEqual(tray.type, "servingTray");
    const bottomPart = tray.parts?.find((p) => p.strips);
    assert.deepStrictEqual(bottomPart?.strips, strips);
    assert.strictEqual(bottomPart?.width, 12);
    // The panel part seeds off the very panel that went in
    assert.strictEqual(bottomPart?.seed, bottom.id);
  });
});

describe("the side table blueprint", () => {
  it("stands the legs on end — bare cross-section footprints at the corners", () => {
    const legs = SIDE_TABLE_BLUEPRINT.slots.filter((s) => s.role === "leg");
    assert.strictEqual(legs.length, 4);
    assert.ok(legs.every((leg) => leg.onEnd));
    for (const leg of legs) {
      const e = slotExtent(leg);
      assert.strictEqual(e.x1 - e.x0, 2);
      assert.strictEqual(e.y1 - e.y0, 1.5);
    }
  });

  it("screws each leg down through the face-down top", () => {
    assert.strictEqual(SIDE_TABLE_BLUEPRINT.fasteners.length, 4);
    assert.deepStrictEqual(blueprintFastenerCost(SIDE_TABLE_BLUEPRINT), [
      { id: "screws", amount: 4 },
    ]);
  });

  it("reads its species off the top, not a headcount its legs would win", () => {
    const top = makeMaterial({
      type: "panel",
      strips: Array.from({ length: 6 }, () => ({
        species: "walnut" as const,
        width: 2 as const,
      })),
      length: 24,
      thickness: 4,
      surface: "sanded",
    } as never);
    const legs = Array.from({ length: 4 }, () =>
      board("pine", 24, 2, 6, "sanded"),
    );
    const table = assembleFromBlueprint(SIDE_TABLE_BLUEPRINT, [top, ...legs]);
    assert.strictEqual(table.species, "walnut");
  });
});

describe("the hex frame blueprint", () => {
  it("turns its rails off the square grid, alternating layers around", () => {
    assert.strictEqual(HEX_FRAME_BLUEPRINT.slots.length, 6);
    assert.deepStrictEqual(
      HEX_FRAME_BLUEPRINT.slots.map((s) => s.angleDeg),
      [90, 150, 210, 270, 330, 390],
    );
    assert.deepStrictEqual(
      HEX_FRAME_BLUEPRINT.slots.map((s) => s.layer),
      [0, 1, 0, 1, 0, 1],
    );
  });

  it("derives one brad per skewed corner lap — six, on the seams", () => {
    assert.strictEqual(HEX_FRAME_BLUEPRINT.fasteners.length, 6);
    // Every fastener joins two *adjacent* rails: a corner, not a span
    for (const f of HEX_FRAME_BLUEPRINT.fasteners) {
      const [a, b] = f.joins.map((id) => Number(id.split("-")[1]));
      assert.strictEqual(Math.min((a - b + 6) % 6, (b - a + 6) % 6), 1);
    }
    // …and lands near its hexagon vertex, inside the frame
    const cx = 12;
    const cy = HEX_FRAME_BLUEPRINT.heightIn / 2;
    for (const f of HEX_FRAME_BLUEPRINT.fasteners) {
      const r = Math.hypot(f.xIn - cx, f.yIn - cy);
      assert.ok(r > 9 && r < 12, `corner brad at radius ${r}`);
    }
  });

  it("assembles a frame from six mirrored 30° rails", () => {
    const rail = () =>
      makeMaterial({
        ...board("walnut", 12, 1, 1, "sanded"),
        ends: {
          left: { kind: "mitered", angle: -30 },
          right: { kind: "mitered", angle: 30 },
        },
      } as never);
    const frame = assembleFromBlueprint(
      HEX_FRAME_BLUEPRINT,
      array(6).map(rail),
    );
    assert.strictEqual(frame.type, "hexFrame");
    assert.strictEqual(frame.species, "walnut");
    assert.strictEqual(frame.parts?.length, 6);
  });
});
