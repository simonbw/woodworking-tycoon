import assert from "node:assert";
import { describe, it } from "node:test";
import { Game } from "../../core/Game";
import { TICKS_PER_DAY } from "../../game/time";
import { pickUpMachine } from "../commands/machine-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { Clock } from "../singletons/Clock";
import { SaveFile, serializeGame } from "./SaveFile";
import { SaveManager } from "./SaveManager";

/**
 * The phase-1 gate: the save path round-trips byte-identically on a
 * minimal shop, headless, and the driver boots and ticks
 * deterministically. Plus the SaveManager's coalescing promises, carried
 * over from src/game/autosave.test.ts's contract, and what makes a save
 * owed in the first place.
 */

/** Let a queued idle write run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

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

  it("rejects a truncated save instead of crashing on the first tick", () => {
    const save = new ShopDriver().save();
    delete (save.singletons as Record<string, unknown>).clock;
    assert.throws(() => new ShopDriver({ save }), /missing required.*clock/);
  });

  it("loads a shop that never bought a vac", () => {
    // The vac is the one singleton a real shop can be without, so its
    // absence must not read as a truncated file.
    const save = new ShopDriver().save();
    assert.ok(!("shopVac" in save.singletons));
    assert.doesNotThrow(() => new ShopDriver({ save }));
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
    // One real minute of engine frames at the idle creep (5/60 game
    // minutes per real second) accrues 5 game minutes; float
    // accumulation across 3600 frames leaves the last carry just shy.
    driver.stepEngine(60 * 60);
    assert.strictEqual(driver.clock.tick, 4);
  });

  it("advances the clock one minute per driver tick", () => {
    const driver = new ShopDriver();
    driver.tick(7);
    assert.strictEqual(driver.clock.tick, 7);
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

  it("writes nothing on a flush that has nothing new to say", () => {
    const { manager, writes } = makeManager();
    manager.flush();
    manager.flush();
    manager.flush();
    assert.strictEqual(writes.length, 1);
  });

  it("flushes a change the periodic check has not seen yet", () => {
    const { driver, manager, writes } = makeManager();
    manager.flush();
    driver.wallet.money = 999;
    // No engine tick in between: the tab going hidden is exactly this
    // case, and the flush has to look at the world itself.
    manager.flush();
    assert.strictEqual(writes.length, 2);
    assert.strictEqual(
      (writes[1].singletons.wallet as { money: number }).money,
      999,
    );
  });

  it("cancel drops a queued write", async () => {
    const { manager, writes } = makeManager();
    manager.schedule();
    manager.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(writes.length, 0);
  });

  it("saves work done at night, when the clock is standing still", async () => {
    const { driver, manager, writes } = makeManager();
    // Past closing: the clock resolves to stopped, so no engine tick
    // from here on carries a sim minute.
    driver.arrange((game) => {
      const clock = game.entities.getSingleton(Clock);
      clock.tick = clock.dayStartTick + TICKS_PER_DAY;
    });
    manager.flush();
    assert.strictEqual(writes.length, 1);

    const tickBefore = driver.clock.tick;
    pickUpMachine(driver.game, driver.machine("lumberShelf"));
    driver.stepEngine(30);
    await settle();

    assert.strictEqual(driver.timeFlow.resolveSpeed(), "stopped");
    assert.strictEqual(driver.clock.tick, tickBefore);
    assert.strictEqual(writes.length, 2);
    const player = writes[1].singletons.player as {
      carriedMachine: { machineTypeId: string } | null;
    };
    assert.strictEqual(player.carriedMachine?.machineTypeId, "lumberShelf");
  });

  it("writes once for a pause, then leaves the file alone", async () => {
    const { driver, manager, writes } = makeManager();
    manager.flush();
    const beforePause = writes.length;

    // The last thing done before the pause still belongs in the file...
    driver.wallet.money = 500;
    driver.game.pause();
    driver.stepEngine(600);
    await settle();
    assert.strictEqual(writes.length, beforePause + 1);

    // ...and a frozen world has nothing more to say, however long it
    // sits there.
    driver.stepEngine(600);
    await settle();
    assert.strictEqual(writes.length, beforePause + 1);
  });

  it("leaves the file alone while no shop is open", async () => {
    // The start menu's world: entities standing by, no shop in them. A
    // write here would replace a real save with an empty one.
    const game = new Game({ headless: true });
    const writes: SaveFile[] = [];
    const manager = game.addEntity(
      new SaveManager({ write: (file) => writes.push(file) }),
    );
    game.step(60);
    manager.flush();
    await settle();
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
