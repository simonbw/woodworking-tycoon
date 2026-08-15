/**
 * The band saw's two cuts, driven the way a player drives them: R turns
 * the stock between standing on edge (resaw) and lying flat (rip), and
 * the same fence serves both — read in quarters one way, inches the
 * other. The resaw-shop fixture stocks the pockets with two milled 8/4
 * walnut blanks, one per cut.
 *
 * (Rehosted from `src/game/sequences/band-saw-orientation.test.ts` onto
 * the entity-world driver — the parity spec for the sim.)
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { resawShop } from "../../../tests/fixtures/resaw-shop";
import { isBoard } from "../../game/board-helpers";
import { ShopDriver } from "../driver/ShopDriver";

const BAND_SAW = "bandSaw";

describe("band saw stock orientation, at the saw", () => {
  it("resaws on edge, rips flat, and R is the only thing that changed", () => {
    const shop = new ShopDriver({ state: resawShop });
    shop.standAtOperatorCell(BAND_SAW).switchOn(BAND_SAW);

    // On edge (the resting default): the 8/4 blank splits into two 4/4
    // boards, kerf-free, edges untouched
    shop.feed(BAND_SAW, isBoard, { targetThickness: 4 });
    const halves = shop.inventory
      .filter(isBoard)
      .filter((b) => b.thickness === 4);
    assert.strictEqual(halves.length, 2);
    for (const half of halves) {
      assert.strictEqual(half.width, 6);
      assert.strictEqual(half.jointedEdges, 2);
    }

    // Turn the remaining blank flat and the same machine rips it to the
    // fence width instead — fresh sawn edges too rough to reference
    shop.feed(BAND_SAW, (m) => isBoard(m) && m.thickness === 8, {
      stockOrientation: "flat",
      targetWidth: 4,
    });
    const ripped = shop.inventory
      .filter(isBoard)
      .filter((b) => b.thickness === 8);
    assert.deepStrictEqual(
      ripped.map((b) => b.width).sort(),
      [2, 4],
      "one piece at the fence, the offcut beside it",
    );
    for (const piece of ripped) {
      assert.strictEqual(piece.jointedEdges, 1);
    }
  });
});
