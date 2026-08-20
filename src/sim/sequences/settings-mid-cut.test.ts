/**
 * Turning a machine's knobs while it's running.
 *
 * An operation doesn't snapshot its settings when it starts — it resolves
 * its output against whatever the machine reads when it finishes. So a
 * fence moved mid-cut used to resolve a cut nobody made, and the band saw
 * would ask a 4/4 board to split at a 8/4 fence and throw out of the tick.
 *
 * The fix is a lock rather than a snapshot: while a station is working, the
 * commands that would move its settings, plan, tools, or upgrades all
 * refuse. These drive that through `ShopDriver`, so they go through the
 * same commands the keys and the station sheet do.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { resawShop } from "../../../tests/fixtures/resaw-shop";
import { isBoard } from "../../game/board-helpers";
import { ShopDriver } from "../driver/ShopDriver";

const BAND_SAW = "bandSaw";

/**
 * A band saw part-way through a resaw: stock on the table, trigger held,
 * a few ticks in but not finished.
 */
function midResaw(): ShopDriver {
  const shop = new ShopDriver({ state: resawShop });
  shop
    .standAtOperatorCell(BAND_SAW)
    .switchOn(BAND_SAW)
    .setSettings(BAND_SAW, { targetThickness: 4 })
    .load(BAND_SAW, (material) => isBoard(material), 1)
    .operate(BAND_SAW)
    .holdOperate(true)
    .tick(5);

  assert.strictEqual(
    shop.machine(BAND_SAW).state.operationProgress.status,
    "inProgress",
    "the saw should still be cutting five ticks in",
  );
  return shop;
}

/** Hold the trigger until the saw stops, however long it takes. */
function finishTheCut(shop: ShopDriver): void {
  for (let i = 0; i < 200; i++) {
    shop.tick();
    if (
      shop.machine(BAND_SAW).state.operationProgress.status !== "inProgress"
    ) {
      shop.holdOperate(false);
      return;
    }
  }
  throw new Error("the resaw never finished");
}

describe("settings while a station is working", () => {
  it("won't move the band saw's fence mid-cut", () => {
    const shop = midResaw();
    shop.setSettings(BAND_SAW, { targetThickness: 8 });

    assert.strictEqual(
      shop.machine(BAND_SAW).state.selectedParameters?.targetThickness,
      4,
      "the fence should still read where the cut started",
    );
  });

  it("finishes the cut the stock was started for", () => {
    const shop = midResaw();
    // The setting the crash report came from: an 8/4 blank part-way
    // through a 4/4 split, asked to split at 8/4 instead
    shop.setSettings(BAND_SAW, { targetThickness: 8 });
    finishTheCut(shop);

    const halves = shop.machine(BAND_SAW).state.outputMaterials;
    assert.strictEqual(halves.length, 2);
    assert.deepStrictEqual(
      halves.map((piece) => (isBoard(piece) ? piece.thickness : null)),
      [4, 4],
    );
  });

  it("lets the fence move again once the saw stops", () => {
    const shop = midResaw();
    finishTheCut(shop);
    shop.setSettings(BAND_SAW, { targetThickness: 6 });

    assert.strictEqual(
      shop.machine(BAND_SAW).state.selectedParameters?.targetThickness,
      6,
    );
  });
});
