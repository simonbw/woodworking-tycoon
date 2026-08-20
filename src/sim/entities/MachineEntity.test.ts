import assert from "node:assert";
import { describe, it } from "node:test";
import { resawShop } from "../../../tests/fixtures/resaw-shop";
import { isBoard } from "../../game/board-helpers";
import { ShopDriver } from "../driver/ShopDriver";
import { DustLayer } from "../singletons/DustLayer";

/**
 * Exemplar #2's contract: machine entities own their MachineState, the
 * MachineSystem advances operations one sim minute at a time (attendance,
 * phase boundaries, dust, completion grants), and the commands enforce
 * the refusals. Driven through the resaw fixture the sequence tier uses.
 */

const BAND_SAW = "bandSaw";

function midResaw(): ShopDriver {
  const shop = new ShopDriver({ state: resawShop });
  shop
    .standAtOperatorCell(BAND_SAW)
    .switchOn(BAND_SAW)
    .setSettings(BAND_SAW, { targetThickness: 4 })
    .load(BAND_SAW, (material) => isBoard(material), 1)
    .operate(BAND_SAW)
    .holdOperate(true);
  shop.tick(5);
  assert.strictEqual(
    shop.machine(BAND_SAW).state.operationProgress.status,
    "inProgress",
    "the saw should still be cutting five ticks in",
  );
  return shop;
}

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

describe("machine operations on the new driver", () => {
  it("runs an attended cut to completion and delivers outputs", () => {
    const shop = midResaw();
    finishTheCut(shop);
    const outputs = shop.machine(BAND_SAW).state.outputMaterials;
    assert.ok(outputs.length >= 2, "the resaw splits the blank");
    for (const output of outputs) {
      assert.ok(isBoard(output));
      assert.strictEqual(output.type === "board" && output.thickness, 4);
    }
  });

  it("pauses the cut when the player walks away, resumes when back", () => {
    const shop = midResaw();
    const progressBefore =
      shop.machine(BAND_SAW).state.operationProgress.ticksRemaining;
    shop.standAt([0, 0]);
    shop.tick(10);
    assert.strictEqual(
      shop.machine(BAND_SAW).state.operationProgress.ticksRemaining,
      progressBefore,
      "an attended cut makes no progress unattended",
    );
    shop.standAtOperatorCell(BAND_SAW);
    shop.tick(1);
    assert.ok(
      shop.machine(BAND_SAW).state.operationProgress.ticksRemaining <
        progressBefore,
      "the cut picks back up at the operator cell",
    );
  });

  it("pauses the cut when the operate key is released", () => {
    const shop = midResaw();
    shop.holdOperate(false);
    const progressBefore =
      shop.machine(BAND_SAW).state.operationProgress.ticksRemaining;
    shop.tick(10);
    assert.strictEqual(
      shop.machine(BAND_SAW).state.operationProgress.ticksRemaining,
      progressBefore,
    );
  });

  it("won't move the fence mid-cut", () => {
    const shop = midResaw();
    shop.setSettings(BAND_SAW, { targetThickness: 8 });
    assert.strictEqual(
      shop.machine(BAND_SAW).state.selectedParameters?.targetThickness,
      4,
      "the fence should still read where the cut started",
    );
  });

  it("sheds dust while the cut runs", () => {
    const shop = midResaw();
    assert.ok(
      Object.keys(shop.game.entities.getSingleton(DustLayer).map).length > 0,
      "an attended cut lays dust down",
    );
  });

  it("counts machine work as spending time", () => {
    const shop = midResaw();
    assert.strictEqual(shop.timeFlow.resolveSpeed(), "working");
    shop.holdOperate(false);
    assert.strictEqual(shop.timeFlow.resolveSpeed(), "idle");
  });

  it("collects outputs into the hands", () => {
    const shop = midResaw();
    finishTheCut(shop);
    const before = shop.player.inventory.length;
    shop.collect(BAND_SAW);
    assert.ok(shop.player.inventory.length > before);
    assert.strictEqual(shop.machine(BAND_SAW).state.outputMaterials.length, 0);
  });

  it("round-trips mid-operation state through the save file", () => {
    const shop = midResaw();
    const save = shop.save();
    const reloaded = new ShopDriver({ save });
    assert.strictEqual(
      reloaded.machine(BAND_SAW).state.operationProgress.status,
      "inProgress",
    );
    assert.strictEqual(
      JSON.stringify(new ShopDriver({ save }).save()),
      JSON.stringify(save),
    );
    // A load drops the held key; the cut waits for the player.
    assert.strictEqual(reloaded.player.operating, false);
  });
});
