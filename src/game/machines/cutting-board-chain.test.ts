import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { MachineOperation, ParameterizedOperation } from "../Machine";
import { materialMeetsInput } from "../material-helpers";
import { panelWidth } from "../Materials";
import { isPanel, panel, uniformPanel } from "../panel-helpers";
import { lunchboxPlaner } from "./lunchboxPlaner";
import { workspace } from "./workspace";

const glueUp = workspace.operations.find(
  (op) => op.id === "glueUpPanel",
) as MachineOperation;
const finish = workspace.operations.find(
  (op) => op.id === "finishCuttingBoard",
) as MachineOperation;
const planePanel = lunchboxPlaner.operations.find(
  (op) => op.id === "planePanel",
) as ParameterizedOperation;

describe("glueUpPanel", () => {
  const strips = Array.from({ length: 5 }, () =>
    board("maple", 2, 2, 4, "smooth"),
  );

  it("requires five smooth 2x2x4 strips", () => {
    const requirement = glueUp.inputMaterials[0];
    assert.strictEqual(requirement.quantity, 5);
    assert.ok(materialMeetsInput(strips[0], requirement));
    assert.ok(
      !materialMeetsInput(board("maple", 2, 4, 4, "smooth"), requirement),
    );
    // Rough faces don't glue — surface prep first
    assert.ok(
      !materialMeetsInput(board("maple", 2, 2, 4, "rough"), requirement),
    );
    // Sanded is even better than smooth, still fine
    assert.ok(
      materialMeetsInput(board("maple", 2, 2, 4, "sanded"), requirement),
    );
  });

  it("glues five strips into a 10-inch panel that comes out rough", () => {
    const { outputs } = glueUp.output(strips);
    assert.strictEqual(outputs.length, 1);
    const result = outputs[0];
    assert.ok(isPanel(result));
    assert.strictEqual(panelWidth(result), 10);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.thickness, 4);
    assert.strictEqual(result.surface, "rough"); // glue squeeze-out
    assert.ok(result.strips.every((strip) => strip.species === "maple"));
  });

  it("preserves strip order for multi-species glue-ups", () => {
    const mixed = [
      board("walnut", 2, 2, 4, "smooth"),
      board("maple", 2, 2, 4, "smooth"),
      board("walnut", 2, 2, 4, "smooth"),
      board("maple", 2, 2, 4, "smooth"),
      board("walnut", 2, 2, 4, "smooth"),
    ];
    const { outputs } = glueUp.output(mixed);
    const result = outputs[0];
    assert.ok(isPanel(result));
    assert.deepStrictEqual(
      result.strips.map((strip) => strip.species),
      ["walnut", "maple", "walnut", "maple", "walnut"],
    );
  });
});

describe("finishCuttingBoard", () => {
  const requirement = finish.inputMaterials[0];
  const goodBlank = uniformPanel("maple", 5, 2, 2, 3, "sanded");

  it("accepts a sanded single-species hardwood panel", () => {
    assert.ok(materialMeetsInput(goodBlank, requirement));
  });

  it("accepts full-thickness sanded panels — the planer is optional", () => {
    assert.ok(
      materialMeetsInput(uniformPanel("maple", 5, 2, 2, 4, "sanded"), requirement),
    );
  });

  it("rejects panels that aren't sanded", () => {
    assert.ok(
      !materialMeetsInput(uniformPanel("maple", 5, 2, 2, 3, "rough"), requirement),
    );
    assert.ok(
      !materialMeetsInput(uniformPanel("maple", 5, 2, 2, 3, "smooth"), requirement),
    );
  });

  it("rejects a panel that is too narrow", () => {
    assert.ok(
      !materialMeetsInput(uniformPanel("maple", 4, 2, 2, 3, "sanded"), requirement),
    );
  });

  it("rejects a panel not made of 2-inch strips", () => {
    const wideStrips = panel(
      [
        { species: "maple", width: 4 },
        { species: "maple", width: 4 },
        { species: "maple", width: 4 },
      ],
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(wideStrips, requirement));
  });

  it("rejects multi-species panels (no two-tone boards yet)", () => {
    const striped = panel(
      [
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
      ],
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(striped, requirement));
  });

  it("rejects pallet wood — no pallet chemicals near food", () => {
    assert.ok(
      !materialMeetsInput(
        uniformPanel("pallet", 5, 2, 2, 3, "sanded"),
        requirement,
      ),
    );
  });

  it("produces a cutting board of the panel's species", () => {
    const { outputs } = finish.output([goodBlank]);
    assert.strictEqual(outputs.length, 1);
    assert.deepStrictEqual(outputs[0].type, "simpleCuttingBoard");
    assert.ok("species" in outputs[0] && outputs[0].species === "maple");
  });
});

describe("planePanel", () => {
  it("thins the panel, smooths it, and preserves its strips", () => {
    const blank = uniformPanel("maple", 5, 2, 2, 4, "rough");
    const { outputs } = planePanel.output([blank], { targetThickness: 3 });
    const result = outputs[0];
    assert.ok(isPanel(result));
    assert.strictEqual(result.thickness, 3);
    assert.strictEqual(result.surface, "smooth");
    assert.deepStrictEqual(result.strips, blank.strips);
  });

  it("accepts panels at or above the target thickness, never below", () => {
    const requirement = planePanel.getInputMaterials({ targetThickness: 3 })[0];
    assert.ok(materialMeetsInput(uniformPanel("maple", 5, 2, 2, 4), requirement));
    // Equal thickness is a skim pass — squeeze-out is sacrificial material
    assert.ok(materialMeetsInput(uniformPanel("maple", 5, 2, 2, 3), requirement));
    assert.ok(
      !materialMeetsInput(uniformPanel("maple", 5, 2, 2, 2), requirement),
    );
  });
});
