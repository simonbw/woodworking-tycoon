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
import { GameState } from "../../game/GameState";
import { getMaterialName, makeToolItem } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { ShopDriver } from "../driver/ShopDriver";
import { TruckEntity } from "../entities/TruckEntity";
import { Consumables } from "../singletons/Consumables";

const WORKBENCH = "workspace";

const isBoard = (m: MaterialInstance) => m.type === "board";
const byLength = (length: number) => (m: MaterialInstance) =>
  isBoard(m) && (m as { length: number }).length === length;
const isPlanterBox = (m: MaterialInstance) => m.type === "planterBox";

/** Open a shop from a fixture and start working it. */
function openShop(state: GameState): ShopDriver {
  return new ShopDriver({ state });
}

/**
 * Both tools bolted on, and a box of screws off the supplies aisle. The
 * fixture stocks one 3' board and four 2' slats — the box wants five, so the
 * long board has to be cut down to make the fifth.
 */
function shopWithBothTools(): ShopDriver {
  return openShop(handToolsShop)
    .arrange((game) => {
      // The two tools wait in the truck's bed, as if just bought —
      // mount() makes the tailgate trips a player would
      const truck = game.entities.getSingleton(TruckEntity);
      truck.bed = [
        ...truck.bed,
        makeToolItem("handSaw"),
        makeToolItem("drill"),
      ];
      const consumables = game.entities.getSingleton(Consumables);
      consumables.stock = { ...consumables.stock, screws: 50 };
    })
    .mount(WORKBENCH, "handSaw")
    .mount(WORKBENCH, "drill");
}

/** Saw the 3' board down to 2', the same setup a miter saw would need. */
function cutTheLongBoardDown(shop: ShopDriver): ShopDriver {
  return shop.make(WORKBENCH, "handSawCut", byLength(36), {
    parameters: { angle: 0, cutEnd: "right", targetLength: 24 },
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
    // Fetching the tools from the tailgate staged the slats on the floor
    // (full arms can't lift a tool), so count stock, not what's in hand
    assert.equal(shop.stock(byLength(24)).length, 4);

    cutTheLongBoardDown(shop);

    // The kept 2' piece joins the four the fixture stocked; the remnant is 1'
    assert.equal(shop.stock(byLength(24)).length, 5);
    assert.equal(shop.stock(byLength(36)).length, 0);
    assert.equal(
      getMaterialName(shop.theOne(byLength(12))),
      "Pallet Wood 4/4 — 4\" × 1'",
    );
  });

  it("five slats and six screws become a planter box", () => {
    const shop = shopWithBothTools();
    cutTheLongBoardDown(shop);
    shop.make(WORKBENCH, "buildPlanterBox", byLength(24), { count: 5 });

    assert.equal(shop.holding(isPlanterBox).length, 1);
    // The blueprint derives the bill: one screw per lapped corner, one
    // where the bottom slat crosses each lower wall — six of the 50
    assert.equal(shop.shop.consumables.screws, 44);
  });

  it("the box won't start when the screw tin is short", () => {
    const shop = shopWithBothTools().arrange((game) => {
      const consumables = game.entities.getSingleton(Consumables);
      consumables.stock = { ...consumables.stock, screws: 5 };
    });

    cutTheLongBoardDown(shop);
    shop
      .standAtOperatorCell(WORKBENCH)
      .select(WORKBENCH, "buildPlanterBox")
      .load(WORKBENCH, byLength(24), 5);
    assert.throws(() => shop.run(WORKBENCH), /would not start/);
  });
});
