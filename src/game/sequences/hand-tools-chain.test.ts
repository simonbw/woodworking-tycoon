/**
 * A planter box out of pallet wood, cut by hand.
 *
 * `tools/hand-tools.test.ts` covers the two tools' operations on their own.
 * The chain is what proves the pitch behind them: that a shop with no power
 * tools at all can still take a scrap board, size it, and screw a product
 * together — the hand saw doing what the miter saw does, slower.
 *
 * `hand-tools.spec.ts` keeps the tool wall, the two-slot rack, and the
 * parameter scales the cut is set up on.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { handToolsShop } from "../../../tests/fixtures/hand-tools-shop";
import { GameState } from "../GameState";
import { getMaterialName } from "../material-helpers";
import { MaterialInstance } from "../Materials";
import { openShop, ShopDriver } from "./shop-driver";

const WORKBENCH = "workspace";

const isBoard = (m: MaterialInstance) => m.type === "board";
const byLength = (length: number) => (m: MaterialInstance) =>
  isBoard(m) && (m as { length: number }).length === length;
const isPlanterBox = (m: MaterialInstance) => m.type === "planterBox";

/**
 * Both tools bolted on, and a box of screws off the supplies aisle. The
 * fixture stocks one 3' board and four 2' slats — the box wants five, so the
 * long board has to be cut down to make the fifth.
 */
function shopWithBothTools(): ShopDriver {
  return openShop(handToolsShop)
    .arrange((state: GameState) => ({
      ...state,
      storage: {
        ...state.storage,
        tools: [...state.storage.tools, "handSaw", "drill"],
      },
      consumables: { ...state.consumables, screws: 50 },
    }))
    .mount(WORKBENCH, "handSaw")
    .mount(WORKBENCH, "drill");
}

/** Saw the 3' board down to 2', the same setup a miter saw would need. */
function cutTheLongBoardDown(shop: ShopDriver): ShopDriver {
  return shop.make(WORKBENCH, "handSawCut", byLength(3), {
    parameters: { angle: 0, cutEnd: "right", targetLength: 2 },
    count: 1,
  });
}

describe("hand tool chain", () => {
  it("both tools fit the bench and each brings its own trade", () => {
    // Neither trade exists on a bare bench
    const bare = openShop(handToolsShop);
    assert.throws(() => bare.select(WORKBENCH, "handSawCut"), /does not offer/);
    assert.throws(
      () => bare.select(WORKBENCH, "buildPlanterBox"),
      /does not offer/,
    );

    const shop = shopWithBothTools();
    assert.equal(shop.machine(WORKBENCH).state.tools.length, 2);
    shop.select(WORKBENCH, "handSawCut");
    shop.select(WORKBENCH, "buildPlanterBox");
  });

  it("a hand cut keeps the target length and leaves the offcut", () => {
    const shop = shopWithBothTools();
    assert.equal(shop.holding(byLength(2)).length, 4);

    cutTheLongBoardDown(shop);

    // The kept 2' piece joins the four the fixture stocked; the remnant is 1'
    assert.equal(shop.stock(byLength(2)).length, 5);
    assert.equal(shop.stock(byLength(3)).length, 0);
    assert.equal(
      getMaterialName(shop.theOne(byLength(1))),
      "Pallet Wood 1/4 — 4\" × 1'",
    );
  });

  it("five slats and eight screws become a planter box", () => {
    const shop = shopWithBothTools();
    cutTheLongBoardDown(shop);
    shop.make(WORKBENCH, "buildPlanterBox", byLength(2), { count: 5 });

    assert.equal(shop.holding(isPlanterBox).length, 1);
    assert.equal(shop.shop.consumables.screws, 42);
  });

  it("the box won't start when the screw tin is short", () => {
    const shop = shopWithBothTools().arrange((state: GameState) => ({
      ...state,
      consumables: { ...state.consumables, screws: 7 },
    }));

    cutTheLongBoardDown(shop);
    shop
      .standAtOperatorCell(WORKBENCH)
      .select(WORKBENCH, "buildPlanterBox")
      .load(WORKBENCH, byLength(2), 5);
    assert.throws(() => shop.run(WORKBENCH), /would not start/);
  });
});
