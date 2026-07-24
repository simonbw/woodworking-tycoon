import assert from "node:assert";
import { describe, it } from "node:test";
import { MaterialPile } from "./GameState";
import { makePallet } from "./material-helpers";
import { Board } from "./Materials";
import { pileCoversCell, pileFootprint } from "./pile-helpers";
import { Vector, vectorKey } from "./Vectors";

/** Every cell in an inclusive x/y range, for comparing footprints. */
function rect(x0: number, x1: number, y0: number, y1: number): Vector[] {
  const cells: Vector[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      cells.push([x, y]);
    }
  }
  return cells;
}

function sorted(cells: ReadonlyArray<Vector>): string[] {
  return cells.map(vectorKey).sort();
}

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

  it("spreads a pallet over the 4'×3' of floor it lies on", () => {
    const pallet: MaterialPile = { material: makePallet(), position: [5, 5] };
    assert.deepStrictEqual(
      sorted(pileFootprint(pallet)),
      sorted(rect(3, 7, 4, 6)),
    );
  });

  it("spreads a sheet good over both of its dimensions", () => {
    // Sheets measure in feet both ways: a 2'×4' offcut covers three cells
    // across and five along.
    const sheet: MaterialPile = {
      material: {
        id: "s",
        type: "plywood",
        kind: "mdf",
        width: 2,
        length: 4,
        thickness: 2,
      },
      position: [5, 5],
    };
    assert.deepStrictEqual(
      sorted(pileFootprint(sheet)),
      sorted(rect(4, 6, 3, 7)),
    );
  });

  it("widens a panel once its strips add up past a cell", () => {
    // Strip widths are inches — four 6" strips make a 2'-wide glue-up.
    const panel: MaterialPile = {
      material: {
        id: "g",
        type: "panel",
        length: 2,
        thickness: 1,
        surface: "rough",
        strips: [1, 2, 3, 4].map(() => ({
          species: "maple" as const,
          width: 6 as const,
        })),
      },
      position: [5, 5],
    };
    assert.deepStrictEqual(
      sorted(pileFootprint(panel)),
      sorted(rect(4, 6, 4, 6)),
    );
  });

  it("keeps small stuff on its anchor cell", () => {
    const shelf: MaterialPile = {
      material: { id: "f", type: "shelf", species: "pine" },
      position: [1, 1],
    };
    assert.deepStrictEqual(pileFootprint(shelf), [[1, 1]]);
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

  it("lets a pallet be grabbed from the side, not just its ends", () => {
    const pile: MaterialPile = { material: makePallet(), position: [5, 5] };
    assert.ok(pileCoversCell(pile, [3, 5]), "two cells across");
    assert.ok(pileCoversCell(pile, [7, 6]), "a far corner");
    assert.ok(!pileCoversCell(pile, [8, 5]), "past the stringers");
    assert.ok(!pileCoversCell(pile, [5, 7]), "past the deck");
  });
});
