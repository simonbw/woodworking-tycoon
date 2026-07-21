import assert from "node:assert";
import { describe, it } from "node:test";
import { board, isBoard } from "../board-helpers";
import { MachineOperation, ParameterizedOperation } from "../Machine";
import { miterSaw } from "../machines/miterSaw";
import { boardEnds } from "../Materials";
import { materialMeetsInput } from "../material-helpers";
import { drill } from "./drill";
import { handSaw } from "./handSaw";

const handSawCut = handSaw.operations.find(
  (op) => op.id === "handSawCut",
) as ParameterizedOperation;
const miterSawCut = miterSaw.operations.find(
  (op) => op.id === "cutBoard",
) as ParameterizedOperation;
const buildPlanterBox = drill.operations.find(
  (op) => op.id === "buildPlanterBox",
) as MachineOperation;

describe("hand saw", () => {
  it("makes the same cut as the miter saw", () => {
    const params = { angle: 45, cutEnd: "left", targetLength: 5 } as const;
    const bySaw = handSawCut.output([board("oak", 8, 4, 4)], params);
    const byMachine = miterSawCut.output([board("oak", 8, 4, 4)], params);
    const [kept, offcut] = bySaw.outputs;
    assert.ok(isBoard(kept) && isBoard(offcut));
    assert.strictEqual(kept.length, 5);
    assert.deepStrictEqual(boardEnds(kept).left, {
      kind: "mitered",
      angle: 45,
    });
    assert.strictEqual(offcut.length, 3);
    // Same pieces the miter saw would leave, ignoring instance ids
    const strip = (m: unknown) => {
      const { id: _, ...rest } = m as { id: string };
      return rest;
    };
    assert.deepStrictEqual(
      bySaw.outputs.map(strip),
      byMachine.outputs.map(strip),
    );
  });

  it("offers the same angle stops as the miter saw, but cuts slower", () => {
    const angles = (op: ParameterizedOperation) =>
      op.parameters.find((p) => p.id === "angle")?.values;
    assert.deepStrictEqual(angles(handSawCut), angles(miterSawCut));
    assert.ok(handSawCut.duration > miterSawCut.duration);
  });
});

describe("drill", () => {
  it("builds a planter box from five short pallet slats and screws", () => {
    assert.deepStrictEqual(buildPlanterBox.requiredConsumables, [
      { id: "screws", amount: 8 },
    ]);
    const slats = Array.from({ length: 5 }, () => board("pallet", 2, 4, 1));
    const { outputs } = buildPlanterBox.output(slats);
    assert.strictEqual(outputs.length, 1);
    assert.strictEqual(outputs[0].type, "planterBox");
    assert.ok("species" in outputs[0] && outputs[0].species === "pallet");
  });

  it("rejects uncut deck boards — the slats must be crosscut to 2' first", () => {
    const freshDeckBoard = board("pallet", 3, 4, 1);
    assert.strictEqual(
      materialMeetsInput(freshDeckBoard, buildPlanterBox.inputMaterials[0]),
      false,
    );
    assert.strictEqual(
      materialMeetsInput(board("pallet", 2, 4, 1), buildPlanterBox.inputMaterials[0]),
      true,
    );
  });
});
