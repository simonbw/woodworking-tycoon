import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { materialMeetsInput } from "../material-helpers";
import { isPanel, uniformPanel } from "../panel-helpers";
import { isBoard } from "../board-helpers";
import { MachineOperation } from "../Machine";
import { TOOL_TYPES } from "../Tool";

const blockSandBoard = TOOL_TYPES.sandingBlock.operations.find(
  (op) => op.id === "blockSandBoard",
) as MachineOperation;
const orbitSandPanel = TOOL_TYPES.randomOrbitSander.operations.find(
  (op) => op.id === "orbitSandPanel",
) as MachineOperation;

describe("sanding operations", () => {
  it("bumps a rough board to smooth", () => {
    const { outputs } = blockSandBoard.output([board("pallet", 3, 4, 1)]);
    assert.ok(isBoard(outputs[0]));
    assert.strictEqual(outputs[0].surface, "smooth");
  });

  it("bumps a smooth board to sanded", () => {
    const { outputs } = blockSandBoard.output([
      board("pallet", 3, 4, 1, "smooth"),
    ]);
    assert.ok(isBoard(outputs[0]));
    assert.strictEqual(outputs[0].surface, "sanded");
  });

  it("never changes dimensions", () => {
    const input = board("maple", 2, 2, 4, "rough");
    const { outputs } = blockSandBoard.output([input]);
    assert.ok(isBoard(outputs[0]));
    assert.strictEqual(outputs[0].length, 2);
    assert.strictEqual(outputs[0].width, 2);
    assert.strictEqual(outputs[0].thickness, 4);
  });

  it("won't accept an already-sanded material", () => {
    const requirement = blockSandBoard.inputMaterials[0];
    assert.ok(
      !materialMeetsInput(board("pallet", 3, 4, 1, "sanded"), requirement),
    );
    assert.ok(
      materialMeetsInput(board("pallet", 3, 4, 1, "rough"), requirement),
    );
  });

  it("sands panels and preserves their strips", () => {
    const blank = uniformPanel("maple", 5, 2, 2, 4, "rough");
    const { outputs } = orbitSandPanel.output([blank]);
    assert.ok(isPanel(outputs[0]));
    assert.strictEqual(outputs[0].surface, "smooth");
    assert.deepStrictEqual(outputs[0].strips, blank.strips);
  });

  it("gives every sanding tool the same abilities, only faster", () => {
    const blockIds = TOOL_TYPES.sandingBlock.operations.map((op) => op.name);
    const orbitIds = TOOL_TYPES.randomOrbitSander.operations.map(
      (op) => op.name,
    );
    assert.deepStrictEqual(blockIds, orbitIds);
    for (let i = 0; i < blockIds.length; i++) {
      assert.ok(
        TOOL_TYPES.randomOrbitSander.operations[i].duration <
          TOOL_TYPES.sandingBlock.operations[i].duration,
      );
    }
  });
});
