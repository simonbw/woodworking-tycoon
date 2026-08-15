/**
 * Sheet goods, bought to built, as a run of work.
 *
 * The cut itself is covered in `sheet-helpers.test.ts` and the prices in
 * `material-values.test.ts`. What this asks is whether the chain holds
 * together when you actually do it in order: whether a full sheet really
 * can't go through the table saw, whether the sawhorses take it, whether
 * the pieces that come off the circular saw reach the fence, and whether
 * what you end up holding is what a jig's blueprint asks for.
 *
 * (Rehosted from `src/game/sequences/sheet-breakdown-chain.test.ts` onto
 * the entity-world driver — the parity spec for the sim.)
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { endGrainShop } from "../../../tests/fixtures/end-grain-shop";
import { CROSSCUT_SLED_BLUEPRINT } from "../../game/bench-work/blueprint";
import { MACHINE_TYPES } from "../../game/Machine";
import { makeToolItem, materialMeetsInput } from "../../game/material-helpers";
import { MaterialInstance, SheetGood } from "../../game/Materials";
import { getSheetBuyPrice } from "../../game/material-values";
import { makeSheet } from "../../game/sheet-helpers";
import { sheetSize } from "../../game/sheetStock";
import { ShopDriver } from "../driver/ShopDriver";

const TABLE_SAW = "jobsiteTableSaw";
const SAWHORSES = "sawhorses";

const isSheet = (m: MaterialInstance) => m.type === "plywood";
const sheetOf = (lengthIn: number, widthIn: number) => (m: MaterialInstance) =>
  m.type === "plywood" && m.length === lengthIn && m.width === widthIn;

/** The sled base slot's requirement — what the chain is aiming at. */
const SLED_BASE = CROSSCUT_SLED_BLUEPRINT.slots.find(
  (slot) => slot.role === "base",
)!.requirement;

/** Buy a sheet, drive home, unload it, and pick it up. */
function fetchSheet(
  shop: ShopDriver,
  size: "full" | "handy" | "project",
): ShopDriver {
  shop.goShopping("orangeBox");
  shop.buySheet("plywoodB", size);
  shop.comeHome();
  shop.putEverythingDown();
  return shop.takeFromFloor(isSheet, 1);
}

function shopWithSawhorses(): ShopDriver {
  const shop = new ShopDriver({ state: endGrainShop });
  shop.arrange(() => {
    shop.wallet.money = 500;
    shop.progression.unlockedSkills.push("jigsAndFixtures");
  });
  shop.putEverythingDown();
  shop.buyAndPlaceMachine(SAWHORSES, MACHINE_TYPES.sawhorses.cost, [3, 10]);
  shop.buyTool("circularSaw");
  shop.mount(SAWHORSES, "circularSaw");
  return shop;
}

describe("sheet breakdown chain", () => {
  it("prices a full sheet under the panels, per square foot", () => {
    const priceOf = (id: "full" | "handy" | "project") => {
      const size = sheetSize(id);
      const piece = makeSheet({
        type: "plywood",
        kind: "plywoodB",
        length: size.length,
        width: size.width,
        thickness: 2,
      });
      return getSheetBuyPrice(piece) / ((size.length / 12) * (size.width / 12));
    };
    assert.ok(priceOf("full") < priceOf("handy"));
    assert.ok(priceOf("handy") < priceOf("project"));
  });

  it("won't take a full sheet on the table saw — there's no lane for it", () => {
    const shop = fetchSheet(shopWithSawhorses(), "full");
    shop
      .standAtOperatorCell(TABLE_SAW)
      .setSettings(TABLE_SAW, { sheetRipWidth: 24 })
      .load(TABLE_SAW, isSheet, 1);
    assert.ok(
      !shop.canOperate(TABLE_SAW),
      "a 96\" sheet should not clear the saw's infeed and outfeed",
    );
  });

  it("breaks the full sheet down on the horses instead", () => {
    const shop = fetchSheet(shopWithSawhorses(), "full");
    // Across the sheet at 4 feet: two 48×48 halves off one 4×8 sheet.
    shop.feed(SAWHORSES, isSheet, {
      cutAcross: "across the sheet",
      straightedge: 48,
    });
    assert.strictEqual(shop.stock(sheetOf(48, 48)).length, 2);
  });

  it("reaches the sled's base through the saw's fence", () => {
    const shop = fetchSheet(shopWithSawhorses(), "full");
    // Two cuts on the horses reduce the sheet to 2-foot squares — cuts
    // no machine in the shop could have made.
    shop.feed(SAWHORSES, isSheet, {
      cutAcross: "across the sheet",
      straightedge: 24,
    });
    shop.putEverythingDown();
    shop.takeFromFloor(sheetOf(48, 24), 1);
    shop.feed(SAWHORSES, isSheet, {
      cutAcross: "across the sheet",
      straightedge: 24,
    });
    shop.putEverythingDown();
    shop.takeFromFloor(sheetOf(24, 24), 1);
    // The fence takes it the rest of the way, to the inch.
    shop.feed(TABLE_SAW, isSheet, { sheetRipWidth: 20 });

    const base = shop.stock(sheetOf(24, 20))[0];
    assert.ok(base, "a 24×20 base should have come off the saw");
    assert.ok(
      materialMeetsInput(base, SLED_BASE),
      "the piece off the saw should satisfy the sled's base slot",
    );
  });

  it("crosscuts to length once the sled is on, and not before", () => {
    const shop = fetchSheet(shopWithSawhorses(), "project");
    assert.ok(
      !shop
        .machine(TABLE_SAW)
        .view()
        .operations.some((op) => op.id === "crosscutSheet"),
      "a bare saw shouldn't offer the sled's crosscut",
    );
    shop.arrange(() => {
      shop.player.inventory.push(makeToolItem("crosscutSled"));
    });
    shop.mount(TABLE_SAW, "crosscutSled");
    shop.feed(TABLE_SAW, isSheet, { sheetCrosscutLength: 18 });
    assert.strictEqual(shop.stock(sheetOf(24, 18)).length, 1);
    assert.strictEqual(shop.stock(sheetOf(24, 6)).length, 1);
  });

  it("ties up two clamps for the straightedge while the cut runs", () => {
    const shop = fetchSheet(shopWithSawhorses(), "full");
    shop.arrange(() => {
      shop.consumables.clamps = 1;
    });
    shop
      .standAtOperatorCell(SAWHORSES)
      .setSettings(SAWHORSES, { straightedge: 48 })
      .load(SAWHORSES, isSheet, 1);
    assert.ok(
      !shop.canOperate(SAWHORSES),
      "one clamp shouldn't be enough to pin a straightedge down",
    );
  });

  it("keeps the offcut — every cut leaves two pieces", () => {
    const shop = fetchSheet(shopWithSawhorses(), "project");
    shop.feed(TABLE_SAW, isSheet, { sheetRipWidth: 20 });
    const pieces = shop.stock(isSheet) as ReadonlyArray<SheetGood>;
    assert.deepStrictEqual(
      pieces.map((piece) => [piece.length, piece.width]),
      [
        [24, 20],
        [24, 4],
      ],
    );
  });
});
