import assert from "node:assert";
import { describe, it } from "node:test";
import { ParameterizedOperation } from "./Machine";
import { lunchboxPlaner } from "./machines/lunchboxPlaner";
import { workspace } from "./machines/workspace";
import { defaultParametersFor, describeOperationIO } from "./operation-helpers";

const planeBoard = lunchboxPlaner.operations.find(
  (op) => op.id === "planeBoard",
) as ParameterizedOperation;
const dismantlePallet = workspace.operations.find(
  (op) => op.id === "dismantlePallet",
)!;
const buildCrosscutSled = workspace.operations.find(
  (op) => op.id === "buildCrosscutSled",
)!;

describe("defaultParametersFor", () => {
  it("starts each parameter at its first listed value", () => {
    assert.deepStrictEqual(defaultParametersFor(planeBoard), {
      targetThickness: planeBoard.parameters[0].values[0],
    });
  });

  it("is undefined for plain operations", () => {
    assert.strictEqual(defaultParametersFor(dismantlePallet), undefined);
  });
});

describe("describeOperationIO", () => {
  it("summarizes a parameterized recipe from its default parameters", () => {
    const io = describeOperationIO(planeBoard);
    assert.strictEqual(io.inputs.length, 1);
    assert.ok(io.inputs[0].length > 0);
    assert.ok(io.outputs.length > 0);
  });

  it("marks multi-quantity ingredients with a count", () => {
    const glueUpPanel = workspace.operations.find(
      (op) => op.id === "glueUpPanel",
    )!;
    const io = describeOperationIO(glueUpPanel);
    assert.ok(
      io.inputs.some((input) => /^\d+× /.test(input)),
      `expected a counted ingredient, got: ${io.inputs.join(" | ")}`,
    );
  });

  it("previews panel-consuming recipes via a mock panel", () => {
    const finishCuttingBoard = workspace.operations.find(
      (op) => op.id === "finishCuttingBoard",
    )!;
    const io = describeOperationIO(finishCuttingBoard);
    assert.ok(
      io.outputs.length > 0,
      "expected the mock panel to satisfy the recipe and yield a board",
    );
  });

  it("lists produced tooling alongside material outputs", () => {
    const io = describeOperationIO(buildCrosscutSled);
    assert.ok(
      io.outputs.includes("Crosscut Sled"),
      `expected Crosscut Sled in: ${io.outputs.join(" | ")}`,
    );
  });
});
