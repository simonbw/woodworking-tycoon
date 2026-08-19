import assert from "node:assert";
import { describe, it } from "node:test";
import { resawShop } from "../../../tests/fixtures/resaw-shop";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { on } from "../../core/entity/handler";
import { isBoard } from "../../game/board-helpers";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { truckCabSideCell } from "../../game/lot";
import { GLUE_CURE_TICKS } from "../../game/machines/benchOperations";
import { getSellValue } from "../../game/material-values";
import { Board, FinishedProduct } from "../../game/Materials";
import { PayoutEvent } from "../../game/PayoutEvent";
import { roundToCents, standFrontage } from "../../game/stand";
import { NIGHT_TICKS, TICKS_PER_DAY } from "../../game/time";
import { beginWakeUp, goHome } from "../commands/day-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { CustomerEntity } from "../entities/CustomerEntity";
import { SaveFile } from "../save/SaveFile";
import { SaveManager } from "../save/SaveManager";

/**
 * The day cycle on the new driver: goHome and beginWakeUp are the old
 * door-actions' goHomeAction/wakeUpAction, with the overnight batch
 * rehosted on the SleepSystem — one sim minute per engine tick through
 * the ordinary layer pipeline, then the morning bookkeeping. Sleeping
 * turns the day over, the overnight genuinely runs the world (cures
 * finish, a mid-browse customer still buys), and the same seed lands
 * the same night every run.
 */

/** The old world's fixture shape, adjusted per test. */
function shopState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

/** A fixed-id product for the stand (no minted ids in fixtures). */
function shelf(id: string): FinishedProduct {
  return { id, type: "rusticShelf", species: "pallet" } as FinishedProduct;
}

/** A fixed-id glue-ready board (24" maple, milled smooth). */
function glueBoard(id: string): Board {
  return {
    id,
    type: "board",
    species: "maple",
    length: 24,
    width: 2,
    thickness: 4,
    surface: "smooth",
    jointedFaces: 2,
    jointedEdges: 2,
  };
}

/** Records every payout the street announces. */
class PayoutRecorder extends BaseEntity {
  events: PayoutEvent[] = [];

  @on("payout")
  onPayout({ payout }: { payout: PayoutEvent }) {
    this.events.push(payout);
  }
}

function customerCount(shop: ShopDriver): number {
  return shop.game.entities.byConstructor(CustomerEntity).size;
}

describe("sleeping through the night", () => {
  it("turns the day over: day+1, fresh dayStartTick, player beside the cab", () => {
    // An evening shop, well past close.
    const shop = new ShopDriver({
      state: shopState({ tick: TICKS_PER_DAY + 40, day: 3 }),
    });
    assert.ok(shop.clock.isNight());

    shop.sleep();

    assert.strictEqual(shop.clock.day, 4);
    // The whole overnight ran through the ordinary pipeline...
    assert.strictEqual(shop.clock.tick, TICKS_PER_DAY + 40 + NIGHT_TICKS);
    // ...and the new day opens with a full budget.
    assert.strictEqual(shop.clock.dayStartTick, shop.clock.tick);
    assert.ok(!shop.clock.isNight());
    assert.strictEqual(shop.player.away, null);
    assert.deepStrictEqual(
      shop.player.cell,
      truckCabSideCell(shop.shopInfo.info),
    );
  });

  it("turns the day over with the morning, not before the night runs", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    goHome(shop.game);

    beginWakeUp(shop.game);
    assert.strictEqual(shop.clock.day, 1);
    shop.stepEngine(100);
    assert.strictEqual(shop.clock.day, 1, "still the same night");
    assert.deepStrictEqual(shop.player.away, { kind: "home" });

    for (
      let guard = 0;
      guard < NIGHT_TICKS + 60 && shop.player.away !== null;
      guard++
    ) {
      shop.stepEngine(1);
    }
    // Morning arrives whole: the day, the fresh budget, and the body
    // back beside the cab, all in the one tick that ends the batch.
    assert.strictEqual(shop.clock.day, 2);
    assert.strictEqual(shop.clock.dayStartTick, shop.clock.tick);
    assert.strictEqual(shop.player.away, null);
  });

  it("sleeps early too, leaving the rest of the day unspent", () => {
    // Always on offer — a noon bedtime just runs the same batch, and the
    // clock arithmetic means the batch's first stretch is still "day"
    // (dayStartTick doesn't move until morning), exactly like the old
    // wakeUpAction's loop.
    const shop = new ShopDriver();
    shop.sleep();
    assert.strictEqual(shop.clock.day, 2);
    assert.strictEqual(shop.clock.tick, NIGHT_TICKS);
    assert.strictEqual(shop.clock.dayStartTick, NIGHT_TICKS);
    assert.strictEqual(shop.player.away, null);
  });

  it("finishes a hands-free cure overnight", () => {
    // The workspace mid-cure: a glued pair in the clamps, curing phase
    // just begun. Hands-free work runs even while the player is away.
    const [workspace, ...rest] = initialGameState.machines;
    const shop = new ShopDriver({
      state: shopState({
        tick: TICKS_PER_DAY,
        machines: [
          {
            ...workspace,
            selectedOperationId: "glueUpPair",
            processingMaterials: [glueBoard("cure-1"), glueBoard("cure-2")],
            operationProgress: {
              status: "inProgress",
              phaseIndex: 1,
              ticksRemaining: GLUE_CURE_TICKS,
            },
          },
          ...rest,
        ],
      }),
    });

    shop.sleep();

    const bench = shop.machine("workspace").state;
    assert.strictEqual(bench.operationProgress.status, "notStarted");
    assert.strictEqual(bench.processingMaterials.length, 0);
    assert.strictEqual(bench.outputMaterials.length, 1);
    const panel = bench.outputMaterials[0];
    assert.strictEqual(panel.type, "panel");
    assert.strictEqual(panel.type === "panel" && panel.strips.length, 2);
    assert.strictEqual(panel.type === "panel" && panel.surface, "rough");
  });

  it("holds attended work where it was left", () => {
    // A resaw abandoned mid-cut: the player is away for every overnight
    // minute, so the attended phase makes no progress, same as stepping
    // away from the saw does.
    const shop = new ShopDriver({ state: resawShop });
    shop
      .standAtOperatorCell("bandSaw")
      .switchOn("bandSaw")
      .setSettings("bandSaw", { targetThickness: 4 })
      .load("bandSaw", (material) => isBoard(material), 1)
      .operate("bandSaw")
      .holdOperate(true);
    shop.tick(5);
    shop.holdOperate(false);
    const progress = shop.machine("bandSaw").state.operationProgress;
    assert.strictEqual(progress.status, "inProgress");

    shop.sleep();

    assert.deepStrictEqual(
      shop.machine("bandSaw").state.operationProgress,
      progress,
      "an attended cut makes no overnight progress",
    );
  });

  it("lets a mid-browse customer buy overnight, and spawns nobody new", () => {
    // The old standTickPass's night gate blocks spawning only — someone
    // already at the table finishes their browse and can still buy. From
    // close onward the whole batch is night, so nobody else shows up.
    const frontage = standFrontage(initialGameState.shopInfo);
    const piece = shelf("night-piece");
    const value = roundToCents(getSellValue(piece));
    const shop = new ShopDriver({
      state: shopState({
        tick: TICKS_PER_DAY,
        stand: [piece],
        customers: [
          {
            id: "customer-nightowl",
            x: (frontage.left + frontage.right) / 2,
            walkDirection: 1,
            state: "browsing",
            browseTicksLeft: 3,
          },
        ],
      }),
    });

    shop.sleep();

    assert.strictEqual(shop.progression.salesCompleted, 1);
    assert.strictEqual(shop.wallet.money, value);
    assert.deepStrictEqual(shop.stand.pieces, []);
    // The buyer walked off the block, and the night summoned no one else.
    assert.strictEqual(customerCount(shop), 0);
  });
});

describe("refusals", () => {
  it("refuses the drive home away from the cab", () => {
    const shop = new ShopDriver();
    shop.standAt([2, 5]);
    assert.strictEqual(goHome(shop.game), false);
    assert.strictEqual(shop.player.away, null);
  });

  it("refuses the drive home with a machine over the shoulders", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    shop.player.carriedMachine = { ...initialGameState.machines[0] };
    assert.strictEqual(goHome(shop.game), false);
    assert.strictEqual(shop.player.away, null);
  });

  it("ignores waking when nobody is home in bed", () => {
    const shop = new ShopDriver();
    const day = shop.clock.day;
    assert.strictEqual(beginWakeUp(shop.game), false);
    shop.stepEngine(5);
    assert.strictEqual(shop.clock.day, day);
    assert.strictEqual(shop.clock.tick, 0);
  });
});

describe("determinism", () => {
  /** A stocked shop slept on immediately; returns the night's trace. */
  function overnightTrace(seed: number) {
    const shop = new ShopDriver({
      seed,
      state: shopState({ stand: [shelf("trace-piece")] }),
    });
    const recorder = shop.game.addEntity(new PayoutRecorder());
    // Sleeping at noon: the batch's first stretch still rolls street
    // dice (the clock hasn't hit close yet), so the night is full of
    // seeded randomness.
    shop.sleep();
    return {
      payouts: recorder.events,
      tick: shop.clock.tick,
      day: shop.clock.day,
      dayStartTick: shop.clock.dayStartTick,
      money: shop.wallet.money,
      reputation: shop.reputation.reputation,
      salesCompleted: shop.progression.salesCompleted,
      customers: [...shop.game.entities.byConstructor(CustomerEntity)].map(
        (customer) => customer.toCustomer(),
      ),
    };
  }

  it("lands the same overnight for the same seed", () => {
    assert.deepStrictEqual(overnightTrace(7), overnightTrace(7));
  });
});

describe("serialization", () => {
  it("round-trips byte-identically while home in bed, pre-wake", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    assert.strictEqual(goHome(shop.game), true);
    assert.deepStrictEqual(shop.player.away, { kind: "home" });

    const save = shop.save();
    const reloaded = new ShopDriver({ save });
    assert.strictEqual(JSON.stringify(reloaded.save()), JSON.stringify(save));
    assert.deepStrictEqual(reloaded.player.away, { kind: "home" });

    // The reloaded shop still wakes to morning.
    assert.strictEqual(beginWakeUp(reloaded.game), true);
    for (
      let guard = 0;
      guard < NIGHT_TICKS + 60 && reloaded.player.away !== null;
      guard++
    ) {
      reloaded.stepEngine(1);
    }
    assert.strictEqual(reloaded.player.away, null);
    assert.strictEqual(reloaded.clock.day, 2);
    assert.strictEqual(reloaded.clock.tick, NIGHT_TICKS);
  });

  it("takes no snapshot part-way through a night", () => {
    // The night is atomic with respect to saving: leave the tab
    // mid-batch and the file still holds the evening, so the reload runs
    // the night once and lands on the next morning — one day, one cure.
    const shop = new ShopDriver();
    const writes: SaveFile[] = [];
    const manager = shop.game.addEntity(
      new SaveManager({ write: (file) => writes.push(file) }),
    );
    shop.standAtCab();
    goHome(shop.game);
    manager.flush();
    assert.strictEqual(writes.length, 1);

    beginWakeUp(shop.game);
    // Every frame of the batch offers the shell's hidden-tab flush.
    for (let i = 0; i < NIGHT_TICKS / 2; i++) {
      shop.stepEngine(1);
      manager.flush();
    }
    assert.strictEqual(writes.length, 1, "the night wrote nothing");

    const evening = writes[0];
    const reloaded = new ShopDriver({ save: evening });
    assert.deepStrictEqual(reloaded.player.away, { kind: "home" });
    assert.strictEqual(reloaded.clock.day, 1);

    assert.strictEqual(beginWakeUp(reloaded.game), true);
    for (
      let guard = 0;
      guard < NIGHT_TICKS + 60 && reloaded.player.away !== null;
      guard++
    ) {
      reloaded.stepEngine(1);
    }
    assert.strictEqual(reloaded.clock.day, 2);
    assert.strictEqual(reloaded.clock.tick, NIGHT_TICKS);
  });

  it("saves the morning once the batch has finished", async () => {
    const shop = new ShopDriver();
    const writes: SaveFile[] = [];
    shop.game.addEntity(
      new SaveManager({ write: (file) => writes.push(file) }),
    );
    shop.sleep();
    shop.stepEngine(30);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const last = writes[writes.length - 1];
    const clock = last.singletons.clock as { day: number };
    const player = last.singletons.player as { away: unknown };
    assert.strictEqual(clock.day, 2);
    assert.strictEqual(player.away, null);
  });
});
