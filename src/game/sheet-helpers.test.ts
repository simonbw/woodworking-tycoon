import assert from "node:assert";
import { describe, it } from "node:test";
import { makeMaterial } from "./material-helpers";
import { SheetGood } from "./Materials";
import { cutSheet, isSheetGood, makeSheet } from "./sheet-helpers";

const sheet = (length: number, width: number): SheetGood =>
  makeMaterial<SheetGood>({
    type: "plywood",
    kind: "plywoodB",
    length,
    width,
    thickness: 2,
  });

describe("cutSheet", () => {
  it("splits a sheet into the kept piece and the offcut", () => {
    const outputs = cutSheet(sheet(96, 48), 24, "width")
      .outputs as ReadonlyArray<SheetGood>;
    assert.strictEqual(outputs.length, 2);
    assert.deepStrictEqual(
      outputs.map((piece) => [piece.length, piece.width]),
      [
        [96, 24],
        [96, 24],
      ],
    );
  });

  it("keeps the piece the fence was set to, whatever is left over", () => {
    const [kept, offcut] = cutSheet(sheet(48, 24), 18, "length")
      .outputs as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual([kept.length, kept.width], [24, 18]);
    assert.deepStrictEqual([offcut.length, offcut.width], [30, 24]);
  });

  it("gives both pieces fresh ids", () => {
    const input = sheet(48, 24);
    const { outputs } = cutSheet(input, 12, "width");
    assert.notStrictEqual(outputs[0].id, input.id);
    assert.notStrictEqual(outputs[0].id, outputs[1].id);
  });

  it("carries the kind and thickness through the cut", () => {
    const { outputs } = cutSheet(sheet(48, 24), 12, "width");
    for (const piece of outputs) {
      assert.ok(isSheetGood(piece));
      assert.strictEqual(piece.kind, "plywoodB");
      assert.strictEqual(piece.thickness, 2);
    }
  });

  it("refuses a cut the sheet is too small for", () => {
    assert.throws(() => cutSheet(sheet(24, 24), 24, "width"));
    assert.throws(() => cutSheet(sheet(24, 24), 30, "width"));
  });
});

describe("makeSheet", () => {
  it("calls the long side the length, whichever way it came in", () => {
    const turned = makeSheet({
      type: "plywood",
      kind: "mdf",
      length: 20,
      width: 48,
      thickness: 3,
    });
    assert.deepStrictEqual([turned.length, turned.width], [48, 20]);
  });

  it("normalizes what comes off a crosscut, so a recipe can ask one way", () => {
    // 48×24 cut to 20 long leaves a 20×24 piece — stored as 24×20
    const [kept] = cutSheet(sheet(48, 24), 20, "length")
      .outputs as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual([kept.length, kept.width], [24, 20]);
  });
});
