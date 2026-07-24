import assert from "node:assert";
import { describe, it } from "node:test";
import { MaterialPile } from "./GameState";
import { Board } from "./Materials";
import { pileCoversCell, pileFootprint } from "./pile-helpers";

function boardPile(length: number, position: [number, number]): MaterialPile {
  const board: Board = {
    id: "test-board",
    type: "board",
    species: "pine",
    length: length as Board["length"],
    width: 4,
    thickness: 1,
    surface: "rough",
    jointedFaces: 1,
    jointedEdges: 2,
  };
  return { material: board, position };
}

describe("pileFootprint", () => {
  it("keeps foot-long stock to its anchor cell", () => {
    assert.deepStrictEqual(pileFootprint(boardPile(1, [3, 3])), [[3, 3]]);
  });

  it("extends boards a cell per foot along their length", () => {
    // Cells are a foot square, so a 2' board centered on its anchor
    // reaches half a foot into each neighbor…
    assert.deepStrictEqual(pileFootprint(boardPile(2, [3, 3])), [
      [3, 2],
      [3, 3],
      [3, 4],
    ]);
    // …and an 8' board spans nine cells.
    assert.deepStrictEqual(
      pileFootprint(boardPile(8, [3, 5])),
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((y) => [3, y]),
    );
  });

  it("uses only the anchor cell for materials without a length", () => {
    const pallet: MaterialPile = {
      material: {
        id: "p",
        type: "pallet",
        deckBoards: [
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
        ],
        stringerBoardsLeft: 3,
      },
      position: [1, 1],
    };
    assert.deepStrictEqual(pileFootprint(pallet), [[1, 1]]);
  });
});

describe("pileCoversCell", () => {
  it("accepts any overlapped cell and rejects the rest", () => {
    const pile = boardPile(8, [3, 5]);
    assert.ok(pileCoversCell(pile, [3, 5]));
    assert.ok(pileCoversCell(pile, [3, 1]));
    assert.ok(pileCoversCell(pile, [3, 9]));
    assert.ok(!pileCoversCell(pile, [3, 0]));
    assert.ok(!pileCoversCell(pile, [3, 10]));
    assert.ok(!pileCoversCell(pile, [2, 5]));
  });
});
