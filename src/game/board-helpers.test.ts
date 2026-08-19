import assert from "node:assert";
import { describe, it } from "node:test";
import { boardFaceRegion, cutBoard, resawBoard } from "./board-helpers";
import { makeMaterial } from "./material-helpers";
import { Board, BoardDimension, defaultBoardFace } from "./Materials";

const board = (
  length: number,
  width: BoardDimension = 6,
  thickness: BoardDimension = 4,
): Board =>
  makeMaterial<Board>({
    type: "board",
    species: "oak",
    length,
    width,
    thickness,
    surface: "rough",
    jointedFaces: 0,
    jointedEdges: 0,
  });

describe("board face regions", () => {
  it("mints every board with a placement inside the scan", () => {
    const input = board(48, 6);
    assert.ok(input.face);
    assert.strictEqual(input.face.seed, input.id);
    assert.ok(input.face.u >= 0 && input.face.u <= 96 - 48);
    assert.ok(input.face.v >= 0 && input.face.v <= 8 - 6);
  });

  it("keeps the placement through an in-place re-mint, like planing", () => {
    const input = board(48, 6);
    const planed = makeMaterial<Board>({
      ...input,
      thickness: 3,
      jointedFaces: 2,
      surface: "smooth",
    });
    assert.notStrictEqual(planed.id, input.id);
    assert.deepStrictEqual(planed.face, input.face);
  });

  it("pins a full-size board to the scan's origin", () => {
    assert.deepStrictEqual(defaultBoardFace("any", 96, 8), {
      seed: "any",
      u: 0,
      v: 0,
    });
  });

  it("slides the kept window past the blade when the left end comes off", () => {
    const input = board(60);
    const parent = boardFaceRegion(input);
    // Default setup cuts the left end off, so the kept piece is the
    // right portion of the parent's window and the offcut keeps origin
    const [kept, offcut] = cutBoard(input, 24, "length")
      .outputs as ReadonlyArray<Board>;
    assert.deepStrictEqual(kept.face, { ...parent, u: parent.u + 36 });
    assert.deepStrictEqual(offcut.face, parent);
  });

  it("keeps the kept window at origin when the right end comes off", () => {
    const input = board(60);
    const parent = boardFaceRegion(input);
    const [kept, offcut] = cutBoard(input, 24, "length", 0, {
      angle: 0,
      cutEnd: "right",
    }).outputs as ReadonlyArray<Board>;
    assert.deepStrictEqual(kept.face, parent);
    assert.deepStrictEqual(offcut.face, { ...parent, u: parent.u + 24 });
  });

  it("leaves the kerf's stretch of wood to nobody", () => {
    const input = board(60);
    const parent = boardFaceRegion(input);
    const [, offcut] = cutBoard(input, 24, "length", 2, {
      angle: 0,
      cutEnd: "right",
    }).outputs as ReadonlyArray<Board>;
    assert.deepStrictEqual(offcut.face, { ...parent, u: parent.u + 26 });
  });

  it("advances a rip's offcut across the width", () => {
    const input = board(48, 6);
    const parent = boardFaceRegion(input);
    const [kept, offcut] = cutBoard(input, 2, "width")
      .outputs as ReadonlyArray<Board>;
    assert.deepStrictEqual(kept.face, parent);
    assert.deepStrictEqual(offcut.face, { ...parent, v: parent.v + 2 });
  });

  it("rerolls the thickness offcut's face — the scan never showed it", () => {
    const input = board(48, 6, 4);
    const parent = boardFaceRegion(input);
    const [kept, offcut] = cutBoard(input, 1, "thickness")
      .outputs as ReadonlyArray<Board>;
    assert.deepStrictEqual(kept.face, parent);
    assert.strictEqual(offcut.face?.seed, offcut.id);
  });

  it("carries the fence-side face through a resaw's re-mint", () => {
    const input = board(48, 6, 4);
    const parent = boardFaceRegion(input);
    const [fenceSide, offcut] = resawBoard(input, 1, {
      sawnSurface: "rough",
    }).outputs as ReadonlyArray<Board>;
    assert.deepStrictEqual(fenceSide.face, parent);
    assert.ok(offcut.face);
    assert.notStrictEqual(offcut.face.seed, input.id);
  });

  it("remembers the original board through repeated cuts", () => {
    const input = board(60);
    const [kept] = cutBoard(input, 40, "length")
      .outputs as ReadonlyArray<Board>;
    const [grandchild] = cutBoard(kept, 2, "width")
      .outputs as ReadonlyArray<Board>;
    assert.strictEqual(grandchild.face?.seed, input.id);
  });
});
