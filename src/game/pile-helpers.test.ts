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
  it("keeps short stock to its anchor cell", () => {
    assert.deepStrictEqual(pileFootprint(boardPile(2, [3, 3])), [[3, 3]]);
    assert.deepStrictEqual(pileFootprint(boardPile(4, [3, 3])), [[3, 3]]);
  });

  it("extends long boards one cell each way along their length", () => {
    assert.deepStrictEqual(pileFootprint(boardPile(6, [3, 3])), [
      [3, 2],
      [3, 3],
      [3, 4],
    ]);
    assert.deepStrictEqual(pileFootprint(boardPile(8, [3, 3])), [
      [3, 2],
      [3, 3],
      [3, 4],
    ]);
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
    const pile = boardPile(8, [3, 3]);
    assert.ok(pileCoversCell(pile, [3, 3]));
    assert.ok(pileCoversCell(pile, [3, 2]));
    assert.ok(pileCoversCell(pile, [3, 4]));
    assert.ok(!pileCoversCell(pile, [3, 5]));
    assert.ok(!pileCoversCell(pile, [2, 3]));
  });
});
