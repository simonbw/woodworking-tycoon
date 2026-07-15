import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { makeMaterial, makePallet } from "./material-helpers";
import { FinishedProduct } from "./Materials";
import { getBoardBuyPrice, getSellValue } from "./material-values";

describe("getSellValue", () => {
  it("prices boards by volume", () => {
    // 4 x 6 x 3 stringer at $0.10/unit
    assert.strictEqual(getSellValue(board("pallet", 4, 6, 3)), 7.2);
    // 3 x 4 x 1 deck board
    assert.strictEqual(getSellValue(board("pallet", 3, 4, 1)), 1.2);
  });

  it("prices a whole pallet below its dismantled boards", () => {
    const pallet = makePallet();
    const dismantledValue =
      3 * getSellValue(board("pallet", 4, 6, 3)) +
      11 * getSellValue(board("pallet", 3, 4, 1));
    assert.ok(getSellValue(pallet) < dismantledValue);
  });

  it("prices finished products well above their input wood", () => {
    const shelf = makeMaterial<FinishedProduct>({
      type: "rusticShelf",
      species: "pallet",
    });
    const inputWood =
      2 * getSellValue(board("pallet", 4, 6, 3)) +
      3 * getSellValue(board("pallet", 3, 4, 1));
    assert.strictEqual(getSellValue(shelf), 60);
    assert.ok(getSellValue(shelf) > 2 * inputWood);
  });
});

describe("getBoardBuyPrice", () => {
  it("keeps buy-and-flip unprofitable for every species", () => {
    for (const species of [
      "pallet",
      "pine",
      "oak",
      "walnut",
      "purpleHeart",
    ] as const) {
      const b = board(species, 8, 8, 8);
      assert.ok(
        getBoardBuyPrice(b) > getSellValue(b),
        `${species} board should cost more than it sells for`,
      );
    }
  });

  it("charges more for fancier species", () => {
    assert.ok(
      getBoardBuyPrice(board("walnut", 4, 4, 2)) >
        getBoardBuyPrice(board("pine", 4, 4, 2)),
    );
  });
});
