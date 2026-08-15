import assert from "node:assert";
import { describe, it } from "node:test";
import { ShopDriver } from "../driver/ShopDriver";
import { SaveFile, serializeGame } from "./SaveFile";
import { SaveManager } from "./SaveManager";

/**
 * The phase-1 gate: the save path round-trips byte-identically on a
 * minimal shop, headless, and the driver boots and ticks
 * deterministically. Plus the SaveManager's coalescing promises, carried
 * over from src/game/autosave.test.ts's contract.
 */

function mutatedShop(): ShopDriver {
  const driver = new ShopDriver({ seed: 7 });
  driver.wallet.money = 123.45;
  driver.reputation.reputation = 6;
  driver.consumables.stock = { ...driver.consumables.stock, nails: 40 };
  driver.consumables.clamps = 4;
  driver.progression.storeUnlocked = true;
  driver.progression.xp = 17;
  driver.tutorials.tutorials.opening = { step: 3, dismissed: false };
  driver.tick(120);
  return driver;
}

describe("save round-trip", () => {
  it("save → load → save is byte-identical on a minimal shop", () => {
    const first = mutatedShop().save();
    const reloaded = new ShopDriver({ save: first });
    const second = reloaded.save();
    assert.strictEqual(JSON.stringify(second), JSON.stringify(first));
  });

  it("carries every singleton's values through the round trip", () => {
    const driver = mutatedShop();
    const reloaded = new ShopDriver({ save: driver.save() });
    assert.strictEqual(reloaded.wallet.money, 123.45);
    assert.strictEqual(reloaded.reputation.reputation, 6);
    assert.strictEqual(reloaded.consumables.stock.nails, 40);
    assert.strictEqual(reloaded.consumables.clamps, 4);
    assert.strictEqual(reloaded.progression.storeUnlocked, true);
    assert.strictEqual(reloaded.progression.xp, 17);
    assert.strictEqual(reloaded.tutorials.tutorials.opening.step, 3);
    assert.strictEqual(reloaded.clock.tick, driver.clock.tick);
    assert.strictEqual(reloaded.clock.fraction, driver.clock.fraction);
    assert.deepStrictEqual(reloaded.shopInfo.info, driver.shopInfo.info);
  });

  it("rejects data that fails a type's schema", () => {
    const save = new ShopDriver().save();
    (save.singletons.wallet as { money: unknown }).money = "rich";
    assert.throws(() => new ShopDriver({ save }));
  });

  it("rejects a save version newer than this build", () => {
    const save = new ShopDriver().save();
    const future: SaveFile = { ...save, version: save.version + 1 };
    assert.throws(() => new ShopDriver({ save: future }), /newer/);
  });
});

describe("driver determinism", () => {
  it("boots and ticks identically for the same seed", () => {
    const run = () => {
      const driver = new ShopDriver({ seed: 42 });
      driver.tick(10_000);
      return JSON.stringify(driver.save());
    };
    assert.strictEqual(run(), run());
  });

  it("advances the clock through TimeFlow's idle creep", () => {
    const driver = new ShopDriver();
    // One real minute of engine time at the idle creep (5 game min per
    // real second at working pace, 5/60 idle) → 5 game minutes, up to
    // float accumulation across 3600 ticks.
    driver.tick(60 * 60);
    const accrued = driver.clock.tick + driver.clock.fraction;
    assert.ok(Math.abs(accrued - 5) < 1e-6, `accrued ${accrued}`);
    assert.strictEqual(driver.clock.tick, 4);
  });
});

describe("SaveManager", () => {
  function makeManager() {
    const driver = new ShopDriver();
    const writes: SaveFile[] = [];
    const manager = driver.game.addEntity(
      new SaveManager({ write: (file) => writes.push(file) }),
    );
    return { driver, manager, writes };
  }

  it("coalesces a burst of schedules into one write", async () => {
    const { manager, writes } = makeManager();
    manager.schedule();
    manager.schedule();
    manager.schedule();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(writes.length, 1);
  });

  it("writes the newest state, not the state at schedule time", async () => {
    const { driver, manager, writes } = makeManager();
    manager.schedule();
    driver.wallet.money = 999;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(
      (writes[0].singletons.wallet as { money: number }).money,
      999,
    );
  });

  it("flushes synchronously", () => {
    const { manager, writes } = makeManager();
    manager.schedule();
    manager.flush();
    assert.strictEqual(writes.length, 1);
  });

  it("does nothing on flush when nothing is queued", () => {
    const { manager, writes } = makeManager();
    manager.flush();
    assert.strictEqual(writes.length, 0);
  });

  it("cancel drops a queued write", async () => {
    const { manager, writes } = makeManager();
    manager.schedule();
    manager.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(writes.length, 0);
  });

  it("survives a save load (persists above the cleared scene)", () => {
    const { driver, manager } = makeManager();
    const save = serializeGame(driver.game);
    assert.ok(manager.isAdded);
    // Loading clears Persistence.Game and below; the manager stays.
    driver.game.entities.getById("saveManager");
    new ShopDriver({ save });
    assert.ok(manager.isAdded);
  });
});
