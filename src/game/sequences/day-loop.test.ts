/**
 * The day loop itself: the spend-to-advance clock's big promises, run
 * through the driver the way a player lives them (docs/time-and-days.md).
 * The unit tests pin the mechanics (door-actions, time-flow, the phase
 * names); what belongs here is the rhythm — glue up in the evening and
 * it's dry in the morning, the board rotates while you sleep, and a
 * closed shop refuses the next cut but never the one already running.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import { marketplaceShop } from "../../../tests/fixtures/marketplace-shop";
import { finishAttendedWorkAction } from "../game-actions/operation-actions";
import { operateMachineAction } from "../game-actions/player-actions";
import { isPanel } from "../panel-helpers";
import { MaterialInstance } from "../Materials";
import { TICKS_PER_DAY } from "../time";
import { isNight, timeSpeed } from "../time-flow";
import { openShop } from "./shop-driver";

const WORKBENCH = "workspace";
const isStrip = (m: MaterialInstance) => m.type === "board";

/** Spend the whole working day so the shop stands at closing time. */
function atClosingTime<T extends { arrange: any }>(shop: T): T {
  return shop.arrange((state: any) => ({
    ...state,
    tick: state.dayStartTick + TICKS_PER_DAY,
  }));
}

describe("the day loop", () => {
  it("cures an evening glue-up overnight", () => {
    const shop = openShop(cuttingBoardShop)
      .standAtOperatorCell(WORKBENCH)
      .select(WORKBENCH, "glueUpPanel")
      .load(WORKBENCH, isStrip);
    // Spread, butt, and clamp by hand — the same commits the bench view
    // makes — but don't wait out the cure: it's the end of the day.
    shop
      .apply(operateMachineAction(shop.machine(WORKBENCH)))
      .apply(finishAttendedWorkAction(shop.machine(WORKBENCH)));
    assert.equal(
      shop.shop.machines.find((m) => m.machineTypeId === WORKBENCH)!
        .operationProgress.status,
      "inProgress",
    );

    atClosingTime(shop).sleep();

    // Dry by morning: the overnight batch ran the cure out and the
    // bench holds the finished panel, ready to collect.
    const bench = shop.shop.machines.find(
      (m) => m.machineTypeId === WORKBENCH,
    )!;
    assert.notEqual(bench.operationProgress.status, "inProgress");
    assert.equal(bench.outputMaterials.filter(isPanel).length, 1);
    shop.collect(WORKBENCH);
    assert.ok(shop.stock(isPanel).length === 1);
  });

  it("rotates the job board while the shop sleeps", () => {
    const shop = openShop(marketplaceShop).tick(1);
    const before = shop.shop.jobBoard;
    assert.ok(before.length > 0);
    assert.equal(shop.shop.jobBoardDay, shop.shop.day);

    shop.sleep();

    // The morning's refresh stamped the new day; unexpired offers may
    // ride along (expiry itself is a marketplace unit test), but the
    // board is full and marked as this morning's.
    assert.equal(shop.shop.jobBoardDay, shop.shop.day);
    assert.ok(shop.shop.jobBoard.length >= before.length);
  });

  it("refuses new work at night but keeps the night quiet, not stuck", () => {
    const shop = atClosingTime(
      openShop(cuttingBoardShop)
        .standAtOperatorCell(WORKBENCH)
        .select(WORKBENCH, "glueUpPanel")
        .load(WORKBENCH, isStrip),
    );
    assert.ok(isNight(shop.shop));
    // The clock has nothing to run on — a closed shop spends nothing.
    assert.equal(timeSpeed(shop.shop), "stopped");

    const refused = operateMachineAction(shop.machine(WORKBENCH))(shop.shop);
    assert.equal(
      refused.machines.find((m) => m.machineTypeId === WORKBENCH)!
        .operationProgress.status,
      "notStarted",
    );

    // Morning clears the refusal: the same start goes through.
    shop.sleep().standAtOperatorCell(WORKBENCH);
    shop.apply(operateMachineAction(shop.machine(WORKBENCH)));
    assert.equal(
      shop.shop.machines.find((m) => m.machineTypeId === WORKBENCH)!
        .operationProgress.status,
      "inProgress",
    );
  });
});
