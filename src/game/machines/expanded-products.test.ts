import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { MachineOperation } from "../Machine";
import {
  isFinishedProduct,
  makeMaterial,
  materialMeetsInput,
} from "../material-helpers";
import { getSellValue } from "../material-values";
import { Board, FinishedProduct, Panel, SignedMiterAngle } from "../Materials";
import { panel } from "../panel-helpers";
import { TOOL_TYPES } from "../Tool";
import { workspace } from "./workspace";

function benchOp(id: string): MachineOperation {
  const op = workspace.operations.find((o) => o.id === id);
  assert.ok(op, `bench operation ${id} exists`);
  return op as MachineOperation;
}

function toolOp(toolId: keyof typeof TOOL_TYPES, id: string): MachineOperation {
  const op = TOOL_TYPES[toolId].operations.find((o) => o.id === id);
  assert.ok(op, `${toolId} operation ${id} exists`);
  return op as MachineOperation;
}

/** A frame rail: both ends mitered at the stop, mirrored so corners close. */
function rail(
  species: Board["species"],
  length: Board["length"],
  angle: SignedMiterAngle,
): Board {
  return makeMaterial<Board>({
    ...board(species, length, 1, 1, "sanded"),
    ends: {
      left: { kind: "mitered", angle },
      right: { kind: "mitered", angle: -angle as SignedMiterAngle },
    },
  });
}

describe("buildBirdhouse", () => {
  it("takes short deck-board crosscuts and yields a birdhouse", () => {
    const op = toolOp("hammer", "buildBirdhouse");
    const requirement = op.inputMaterials[0];
    assert.ok(materialMeetsInput(board("pallet", 1, 4, 1), requirement));
    // Whole deck boards are too long
    assert.ok(!materialMeetsInput(board("pallet", 3, 4, 1), requirement));

    const inputs = Array.from({ length: 4 }, () => board("pallet", 1, 4, 1));
    const { outputs } = op.output(inputs);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "birdhouse");
    assert.strictEqual(outputs[0].species, "pallet");
  });
});

describe("buildCrate", () => {
  it("takes six whole deck boards", () => {
    const op = toolOp("hammer", "buildCrate");
    const inputs = Array.from({ length: 6 }, () => board("pallet", 3, 4, 1));
    const { outputs } = op.output(inputs);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "crate");
  });
});

describe("buildStepStool", () => {
  it("takes stout sides plus thinner treads", () => {
    const op = toolOp("drill", "buildStepStool");
    const [sides, treads] = op.inputMaterials;
    // Crosscut pallet stringers qualify as sides
    assert.ok(materialMeetsInput(board("pallet", 2, 6, 3), sides));
    // Deck-board crosscuts qualify as treads
    assert.ok(materialMeetsInput(board("pallet", 2, 4, 1), treads));
    // A tread is too thin to be a side
    assert.ok(!materialMeetsInput(board("pallet", 2, 4, 1), sides));

    const { outputs } = op.output([
      board("pallet", 2, 6, 3),
      board("pallet", 2, 6, 3),
      board("pallet", 2, 4, 1),
      board("pallet", 2, 4, 1),
    ]);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "stepStool");
  });
});

describe("buildBookshelf", () => {
  it("takes four sanded hardwood boards — twice the single shelf", () => {
    const op = toolOp("drill", "buildBookshelf");
    const requirement = op.inputMaterials[0];
    assert.ok(materialMeetsInput(board("oak", 4, 6, 4, "sanded"), requirement));
    assert.ok(
      !materialMeetsInput(board("pallet", 4, 6, 4, "sanded"), requirement),
    );

    const inputs = Array.from({ length: 4 }, () =>
      board("oak", 4, 6, 4, "sanded"),
    );
    const { outputs } = op.output(inputs);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "bookshelf");
    assert.strictEqual(outputs[0].species, "oak");
  });
});

describe("buildHexFrame", () => {
  const op = benchOp("buildHexFrame");
  const requirement = op.inputMaterials[0];

  it("wants rails mitered at the 30° stop, mirrored", () => {
    assert.ok(materialMeetsInput(rail("cherry", 1, 30), requirement));
    // The picture frame's 45° rails don't close a hexagon
    assert.ok(!materialMeetsInput(rail("cherry", 1, 45), requirement));
    // Square-ended stock isn't a rail at all
    assert.ok(
      !materialMeetsInput(board("cherry", 1, 1, 1, "sanded"), requirement),
    );
  });

  it("produces a hex frame of the rail species", () => {
    const inputs = Array.from({ length: 6 }, () => rail("cherry", 1, 30));
    const { outputs } = op.output(inputs);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "hexFrame");
    assert.strictEqual(outputs[0].species, "cherry");
  });
});

describe("buildServingTray", () => {
  const op = benchOp("buildServingTray");

  const bottom = (species: "maple" | "pallet" = "maple"): Panel =>
    panel(
      Array.from({ length: 4 }, () => ({
        species,
        width: 2 as const,
      })),
      2,
      3,
      "sanded",
    );

  it("wants a sanded real-wood panel bottom and 45° rails", () => {
    const [panelReq, railReq] = op.inputMaterials;
    assert.ok(materialMeetsInput(bottom(), panelReq));
    assert.ok(!materialMeetsInput(bottom("pallet"), panelReq));
    assert.ok(materialMeetsInput(rail("maple", 2, 45), railReq));
  });

  it("produces a tray named for the panel's dominant wood", () => {
    const { outputs } = op.output([
      bottom(),
      ...Array.from({ length: 4 }, () => rail("maple", 2, 45)),
    ]);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "servingTray");
    assert.strictEqual(outputs[0].species, "maple");
  });
});

describe("buildSideTable", () => {
  const op = benchOp("buildSideTable");

  it("wants a wide sanded top — wider than any single board", () => {
    const topReq = op.inputMaterials[0];
    const wide = panel(
      Array.from({ length: 6 }, () => ({
        species: "walnut" as const,
        width: 2 as const,
      })),
      2,
      4,
      "sanded",
    );
    const narrow = panel(
      Array.from({ length: 4 }, () => ({
        species: "walnut" as const,
        width: 2 as const,
      })),
      2,
      4,
      "sanded",
    );
    assert.ok(materialMeetsInput(wide, topReq));
    assert.ok(!materialMeetsInput(narrow, topReq));
  });

  it("wants square 8/4 legs", () => {
    const legReq = op.inputMaterials[1];
    assert.ok(materialMeetsInput(board("walnut", 2, 2, 8, "sanded"), legReq));
    // Thin stock can't hold up a table
    assert.ok(!materialMeetsInput(board("walnut", 2, 2, 4, "sanded"), legReq));
  });
});

describe("finishCheckerboardBoard", () => {
  const op = benchOp("finishCheckerboardBoard");
  const requirement = op.inputMaterials[0];

  const blank = (
    strips: ReadonlyArray<{ species: "walnut" | "maple"; width: 2 }>,
  ): Panel =>
    makeMaterial<Panel>({
      type: "panel",
      grain: "end",
      strips,
      length: 1,
      thickness: 8,
      surface: "sanded",
    });

  const alternating = Array.from({ length: 5 }, (_, i) => ({
    species: i % 2 === 0 ? ("walnut" as const) : ("maple" as const),
    width: 2 as const,
  }));

  it("accepts a striped two-species end-grain blank", () => {
    assert.ok(materialMeetsInput(blank(alternating), requirement));
  });

  it("rejects a single-species blank (that's a butcher block)", () => {
    const uniform = Array.from({ length: 5 }, () => ({
      species: "walnut" as const,
      width: 2 as const,
    }));
    assert.ok(!materialMeetsInput(blank(uniform), requirement));
  });

  it("rejects long-grain panels outright", () => {
    const longGrain = panel(alternating, 1, 8, "sanded");
    assert.ok(!materialMeetsInput(longGrain, requirement));
  });

  it("produces the priciest board on the roster", () => {
    const { outputs } = op.output([blank(alternating)]);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "checkerboardCuttingBoard");
    assert.strictEqual(outputs[0].species, "walnut");
    assert.strictEqual(outputs[0].accentSpecies, "maple");
    // Beats the plain end-grain block in the same woods
    const endGrain = makeMaterial<FinishedProduct>({
      type: "endGrainCuttingBoard",
      species: "walnut",
    });
    assert.ok(getSellValue(outputs[0]) > getSellValue(endGrain));
  });

  it("is oilable like every other cutting board", () => {
    const oil = benchOp("oilCuttingBoard");
    const { outputs } = op.output([blank(alternating)]);
    assert.ok(materialMeetsInput(outputs[0], oil.inputMaterials[0]));
  });
});
