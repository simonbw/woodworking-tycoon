import assert from "node:assert";
import { describe, it } from "node:test";
import { makeMaterial } from "./material-helpers";
import { SheetGood } from "./Materials";
import {
  cutSheet,
  isSheetGood,
  makeSheet,
  sheetFacePoint,
  sheetFaceRegion,
} from "./sheet-helpers";

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

describe("sheet face regions", () => {
  it("treats a virgin sheet as its own source, at the origin", () => {
    const virgin = sheet(96, 48);
    assert.deepStrictEqual(sheetFaceRegion(virgin), {
      seed: virgin.id,
      u: 0,
      v: 0,
      rotated: false,
    });
  });

  it("starts the offcut's region where the blade fell", () => {
    const input = sheet(96, 48);
    const [kept, offcut] = cutSheet(input, 60, "length")
      .outputs as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual(kept.face, {
      seed: input.id,
      u: 0,
      v: 0,
      rotated: false,
    });
    // The 36×48 offcut normalizes to 48×36 — turned, but still rooted
    // at the 60-inch line
    assert.deepStrictEqual(offcut.face, {
      seed: input.id,
      u: 60,
      v: 0,
      rotated: true,
    });
  });

  it("advances a width cut across the source, not along it", () => {
    const input = sheet(96, 48);
    const [, offcut] = cutSheet(input, 18, "width")
      .outputs as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual(offcut.face, {
      seed: input.id,
      u: 0,
      v: 18,
      rotated: false,
    });
  });

  it("marks the piece normalization turned, and its veneer stays put", () => {
    // 96×48 cut to 40 long: the 40×48 kept piece is stored as 48×40,
    // a quarter turn against its source
    const input = sheet(96, 48);
    const [kept] = cutSheet(input, 40, "length")
      .outputs as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual([kept.length, kept.width], [48, 40]);
    assert.strictEqual(kept.face?.rotated, true);
    // A point on the turned piece reads the source point the unturned
    // piece would have: its width runs along the source's length
    assert.deepStrictEqual(sheetFacePoint(kept.face, 30, 12), {
      u: 12,
      v: 30,
    });
  });

  it("keeps the veneer unbroken across the cut line", () => {
    const input = sheet(96, 48);
    const parentFace = sheetFaceRegion(input);
    const [, offcut] = cutSheet(input, 60, "length")
      .outputs as ReadonlyArray<SheetGood>;
    // The offcut's across-the-cut edge is the parent's 60-inch line;
    // normalization turned the piece, so that edge is its width edge
    // and the parent's across-axis is its length axis
    for (const across of [0, 17, 48]) {
      assert.deepStrictEqual(
        sheetFacePoint(sheetFaceRegion(offcut), across, 0),
        sheetFacePoint(parentFace, 60, across),
      );
    }
  });

  it("cuts a turned piece along the right source axis", () => {
    // The turned kept piece from above: 48×40, its width lying along
    // the source's length. Cutting its width moves along source u.
    const input = sheet(96, 48);
    const [kept] = cutSheet(input, 40, "length")
      .outputs as ReadonlyArray<SheetGood>;
    const [, offcut] = cutSheet(kept, 15, "width")
      .outputs as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual(offcut.face, {
      seed: input.id,
      u: 15,
      v: 0,
      rotated: true,
    });
  });

  it("remembers the original sheet through repeated cuts", () => {
    const input = sheet(96, 48);
    const [kept] = cutSheet(input, 60, "length")
      .outputs as ReadonlyArray<SheetGood>;
    const [grandchild] = cutSheet(kept, 20, "width")
      .outputs as ReadonlyArray<SheetGood>;
    assert.strictEqual(grandchild.face?.seed, input.id);
  });
});
