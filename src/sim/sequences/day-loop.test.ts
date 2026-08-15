/**
 * The day loop itself: the spend-to-advance clock's big promises, run
 * through the driver the way a player lives them (see time-flow.ts).
 * The unit tests pin the mechanics (door-actions, time-flow, the phase
 * names); what belongs here is the rhythm — glue up in the evening and
 * it's dry in the morning, and a closed shop refuses the next cut but
 * never the one already running.
 *
 * Rehosted from `src/game/sequences/day-loop.test.ts` onto the entity
 * world's driver — same structure, same assertions; this file is part
 * of the migration's parity spec (MIGRATION.md phase 2).
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import { isPanel } from "../../game/panel-helpers";
import { MaterialInstance } from "../../game/Materials";
import { TICKS_PER_DAY } from "../../game/time";
import {
  finishAttendedWork,
  operateMachine,
} from "../commands/machine-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { Clock } from "../singletons/Clock";

const WORKBENCH = "workspace";
const isStrip = (m: MaterialInstance) => m.type === "board";

/** Spend the whole working day so the shop stands at closing time. */
function atClosingTime(shop: ShopDriver): ShopDriver {
  return shop.arrange((game) => {
    const clock = game.entities.getSingleton(Clock);
    clock.tick = clock.dayStartTick + TICKS_PER_DAY;
  });
}

describe("the day loop", () => {
  it("cures an evening glue-up overnight", () => {
    const shop = new ShopDriver({ state: cuttingBoardShop })
      .standAtOperatorCell(WORKBENCH)
      .select(WORKBENCH, "glueUpPanel")
      .load(WORKBENCH, isStrip);
    // Spread, butt, and clamp by hand — the same commits the bench view
    // makes — but don't wait out the cure: it's the end of the day.
    operateMachine(shop.game, shop.machine(WORKBENCH));
    finishAttendedWork(shop.game, shop.machine(WORKBENCH));
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

  it("refuses new work at night but keeps the night quiet, not stuck", () => {
    const shop = atClosingTime(
      new ShopDriver({ state: cuttingBoardShop })
        .standAtOperatorCell(WORKBENCH)
        .select(WORKBENCH, "glueUpPanel")
        .load(WORKBENCH, isStrip),
    );
    assert.ok(shop.clock.isNight());
    // The clock has nothing to run on — a closed shop spends nothing.
    assert.equal(shop.timeFlow.resolveSpeed(), "stopped");

    // The start refuses at night, leaving the bench unstarted.
    operateMachine(shop.game, shop.machine(WORKBENCH));
    assert.equal(
      shop.shop.machines.find((m) => m.machineTypeId === WORKBENCH)!
        .operationProgress.status,
      "notStarted",
    );

    // Morning clears the refusal: the same start goes through.
    shop.sleep().standAtOperatorCell(WORKBENCH);
    operateMachine(shop.game, shop.machine(WORKBENCH));
    assert.equal(
      shop.shop.machines.find((m) => m.machineTypeId === WORKBENCH)!
        .operationProgress.status,
      "inProgress",
    );
  });
});
