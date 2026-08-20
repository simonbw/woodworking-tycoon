/**
 * Direct-feed machines: the power switch, and what the stock on the table
 * decides. There is no mode picker on a jointer or a planer — you set the
 * board down, hold the trigger, and the machine runs the pass the board
 * still needs (see the `directFeed` field docs in Machine.ts).
 *
 * Driven through `ShopDriver` against the milling fixture, so every step
 * goes through the same commands the keys do: the switch, the deposit on
 * the table, the trigger.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { millingShop } from "../../../tests/fixtures/milling-shop";
import { board } from "../../game/board-helpers";
import { MachineId } from "../../game/Machine";
import { Board, MaterialInstance } from "../../game/Materials";
import { ShopDriver } from "../driver/ShopDriver";

const JOINTER = "jointer";
const PLANER = "lunchboxPlaner";

const isBoard = (material: MaterialInstance) => material.type === "board";

/** Rough off the rack: nothing flat, nothing straight. */
const roughStock = () =>
  board("walnut", 48, 5, 4, "rough", { faces: 0, edges: 0 });

/**
 * The milling shop with one named piece in the player's hands, standing
 * at the machine's operator cell ready to set it down.
 */
function shopHolding(stock: Board, machineTypeId: MachineId): ShopDriver {
  const shop = new ShopDriver({ state: millingShop });
  shop.player.inventory = [stock];
  return shop.standAtOperatorCell(machineTypeId);
}

describe("the power switch", () => {
  it("refuses the trigger while the machine is switched off", () => {
    const shop = shopHolding(roughStock(), JOINTER).load(JOINTER, isBoard);
    shop.operate(JOINTER);
    assert.strictEqual(
      shop.machine(JOINTER).state.operationProgress.status,
      "notStarted",
    );
    // The stock stays on the table, waiting for the switch
    assert.strictEqual(shop.machine(JOINTER).state.inputMaterials.length, 1);
  });

  it("starts the cut once switched on", () => {
    const shop = shopHolding(roughStock(), JOINTER)
      .load(JOINTER, isBoard)
      .switchOn(JOINTER);
    shop.operate(JOINTER);
    assert.strictEqual(
      shop.machine(JOINTER).state.operationProgress.status,
      "inProgress",
    );
    assert.strictEqual(
      shop.machine(JOINTER).state.processingMaterials.length,
      1,
    );
  });
});

describe("the jointer runs what the board still needs", () => {
  it("gives a rough board a face pass", () => {
    const shop = shopHolding(roughStock(), JOINTER)
      .load(JOINTER, isBoard)
      .switchOn(JOINTER);
    shop.operate(JOINTER);
    assert.strictEqual(
      shop.machine(JOINTER).state.selectedOperationId,
      "jointFace",
    );
    assert.deepStrictEqual(shop.machine(JOINTER).state.inputMaterials, []);
  });

  it("gives a face-jointed board its edge — no mode was ever picked", () => {
    const faceDone = board("walnut", 48, 5, 4, "rough", { faces: 1, edges: 0 });
    const shop = shopHolding(faceDone, JOINTER)
      .load(JOINTER, isBoard)
      .switchOn(JOINTER);
    shop.operate(JOINTER);
    assert.strictEqual(
      shop.machine(JOINTER).state.selectedOperationId,
      "jointEdge",
    );
    assert.deepStrictEqual(shop.machine(JOINTER).state.processingMaterials, [
      faceDone,
    ]);
  });

  it("refuses fully milled stock — the jointer has nothing to add", () => {
    const milled = board("walnut", 48, 5, 4, "smooth", { faces: 2, edges: 2 });
    const shop = shopHolding(milled, JOINTER)
      .load(JOINTER, isBoard)
      .switchOn(JOINTER);
    assert.strictEqual(shop.canOperate(JOINTER), false);
    shop.operate(JOINTER);
    assert.strictEqual(
      shop.machine(JOINTER).state.operationProgress.status,
      "notStarted",
    );
    assert.strictEqual(shop.machine(JOINTER).state.inputMaterials.length, 1);
  });
});

describe("the planer runs to the height it is set to", () => {
  it("feeds the board on the table straight into the cut", () => {
    // 4/4 rough with a flat face: a skim pass at cut height 4
    const stock = board("walnut", 96, 6, 4, "rough");
    const shop = shopHolding(stock, PLANER)
      .setSettings(PLANER, { targetThickness: 4 })
      .load(PLANER, isBoard)
      .switchOn(PLANER);
    shop.operate(PLANER);
    assert.strictEqual(
      shop.machine(PLANER).state.operationProgress.status,
      "inProgress",
    );
    assert.deepStrictEqual(shop.machine(PLANER).state.processingMaterials, [
      stock,
    ]);
    // Off the table and into the cut
    assert.deepStrictEqual(shop.machine(PLANER).state.inputMaterials, []);
  });

  it("refuses stock the cut height can't take", () => {
    // Two detents above the cut height won't fit under the head
    const shop = shopHolding(board("walnut", 96, 6, 6, "rough"), PLANER)
      .setSettings(PLANER, { targetThickness: 4 })
      .load(PLANER, isBoard)
      .switchOn(PLANER);
    assert.strictEqual(shop.canOperate(PLANER), false);
    shop.operate(PLANER);
    assert.strictEqual(
      shop.machine(PLANER).state.operationProgress.status,
      "notStarted",
    );
  });

  it("refuses while switched off, leaving the stock on the table", () => {
    const shop = shopHolding(board("walnut", 96, 6, 4, "rough"), PLANER)
      .setSettings(PLANER, { targetThickness: 4 })
      .load(PLANER, isBoard);
    shop.operate(PLANER);
    assert.strictEqual(
      shop.machine(PLANER).state.operationProgress.status,
      "notStarted",
    );
    assert.strictEqual(shop.machine(PLANER).state.inputMaterials.length, 1);
  });
});
