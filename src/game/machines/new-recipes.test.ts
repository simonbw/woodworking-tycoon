import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { MachineOperation } from "../Machine";
import { isFinishedProduct, materialMeetsInput } from "../material-helpers";
import { getSellValue } from "../material-values";
import { panel } from "../panel-helpers";
import { workspace } from "./workspace";

const buildShelf = workspace.operations.find(
  (op) => op.id === "buildShelf",
) as MachineOperation;
const finishTwoTone = workspace.operations.find(
  (op) => op.id === "finishTwoToneBoard",
) as MachineOperation;
// The jewelry box moved to the shared bench list when the makeshift bench
// retired — any bench station carries it now
const buildJewelryBox = workspace.operations.find(
  (op) => op.id === "buildJewelryBox",
) as MachineOperation;

describe("buildShelf", () => {
  it("requires sanded hardwood, not pallet wood", () => {
    const requirement = buildShelf.inputMaterials[0];
    assert.ok(
      materialMeetsInput(board("maple", 4, 6, 4, "sanded"), requirement),
    );
    assert.ok(
      !materialMeetsInput(board("pallet", 4, 6, 4, "sanded"), requirement),
    );
    assert.ok(
      !materialMeetsInput(board("maple", 4, 6, 4, "smooth"), requirement),
    );
  });

  it("produces a shelf of the input species", () => {
    const inputs = [
      board("cherry", 4, 6, 4, "sanded"),
      board("cherry", 4, 6, 4, "sanded"),
    ];
    const { outputs } = buildShelf.output(inputs);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "shelf");
    assert.strictEqual(outputs[0].species, "cherry");
  });
});

describe("buildJewelryBox", () => {
  it("requires thin sanded stock — the planer era", () => {
    const requirement = buildJewelryBox.inputMaterials[0];
    assert.ok(
      materialMeetsInput(board("walnut", 2, 4, 2, "sanded"), requirement),
    );
    // Full-thickness stock won't do
    assert.ok(
      !materialMeetsInput(board("walnut", 2, 4, 4, "sanded"), requirement),
    );
  });

  it("produces a jewelry box of the input species", () => {
    const inputs = Array.from({ length: 4 }, () =>
      board("walnut", 2, 4, 2, "sanded"),
    );
    const { outputs } = buildJewelryBox.output(inputs);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].type, "jewelryBox");
    assert.strictEqual(outputs[0].species, "walnut");
  });
});

describe("finishTwoToneBoard", () => {
  const requirement = finishTwoTone.inputMaterials[0];
  const twoTone = (surface: "rough" | "smooth" | "sanded") =>
    panel(
      [
        { species: "walnut" as const, width: 2 as const },
        { species: "maple" as const, width: 2 as const },
        { species: "walnut" as const, width: 2 as const },
        { species: "maple" as const, width: 2 as const },
        { species: "walnut" as const, width: 2 as const },
      ],
      2,
      3,
      surface,
    );

  it("accepts a sanded two-species panel", () => {
    assert.ok(materialMeetsInput(twoTone("sanded"), requirement));
  });

  it("rejects single-species panels (that's a plain cutting board)", () => {
    const uniform = panel(
      Array.from({ length: 5 }, () => ({
        species: "maple" as const,
        width: 2 as const,
      })),
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(uniform, requirement));
  });

  it("names the majority species first and the accent second", () => {
    const { outputs } = finishTwoTone.output([twoTone("sanded")]);
    assert.ok(isFinishedProduct(outputs[0]));
    assert.strictEqual(outputs[0].species, "walnut"); // 3 strips vs 2
    assert.strictEqual(outputs[0].accentSpecies, "maple");
  });

  it("sells at a premium over both solid versions", () => {
    const { outputs } = finishTwoTone.output([twoTone("sanded")]);
    const twoToneValue = getSellValue(outputs[0]);
    // walnut 5, maple 3 -> avg 4 x 1.5 premium = x6 vs walnut's x5
    assert.strictEqual(twoToneValue, 40 * 6);
    assert.ok(twoToneValue > 40 * 5);
  });
});
