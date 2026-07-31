import assert from "node:assert";
import { describe, it } from "node:test";
import { MaterialPile } from "./GameState";
import { makePallet } from "./material-helpers";
import { Board } from "./Materials";
import { pileWithinReach } from "./pile-helpers";

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

describe("pileWithinReach", () => {
  it("keeps a small piece to the cell it rests in", () => {
    const shelf: MaterialPile = {
      material: { id: "f", type: "shelf", species: "pine" },
      position: [1.5, 1.5],
    };
    assert.ok(pileWithinReach(shelf, [1, 1]));
    assert.ok(!pileWithinReach(shelf, [2, 1]), "a cell over is out of reach");
    assert.ok(!pileWithinReach(shelf, [1, 2]));
  });

  it("reaches a piece resting near the standing cell's edge", () => {
    // Set down mid-stride, a piece can land right on a cell line — both
    // neighbors are close enough to grab it.
    const shelf: MaterialPile = {
      material: { id: "f", type: "shelf", species: "pine" },
      position: [2, 1.5],
    };
    assert.ok(pileWithinReach(shelf, [1, 1]));
    assert.ok(pileWithinReach(shelf, [2, 1]));
    assert.ok(!pileWithinReach(shelf, [3, 1]));
  });

  it("lets long stock be grabbed anywhere along its length", () => {
    // An 8' board centered at [3.5, 5.5] lies across y 1.5..9.5
    const pile = boardPile(8, [3.5, 5.5]);
    assert.ok(pileWithinReach(pile, [3, 5]), "the cell under its center");
    assert.ok(pileWithinReach(pile, [3, 1]), "one end");
    assert.ok(pileWithinReach(pile, [3, 9]), "the other end");
    assert.ok(!pileWithinReach(pile, [3, 0]), "past the end");
    assert.ok(!pileWithinReach(pile, [3, 10]));
  });

  it("lets a pallet be grabbed from the side, not just its ends", () => {
    // A pallet is 4'×3' — its edges reach well past the cell it centers on
    const pile: MaterialPile = { material: makePallet(), position: [5.5, 5.5] };
    assert.ok(pileWithinReach(pile, [3, 5]), "two cells across");
    assert.ok(pileWithinReach(pile, [7, 6]), "a far corner");
    assert.ok(!pileWithinReach(pile, [9, 5]), "well past the stringers");
    assert.ok(!pileWithinReach(pile, [5, 8]), "well past the deck");
  });
});
