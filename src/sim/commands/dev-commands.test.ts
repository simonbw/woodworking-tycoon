import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { ALL_ARTICLE_IDS } from "../../game/manual";
import { SKILL_IDS } from "../../game/Skill";
import { ShopDriver } from "../driver/ShopDriver";
import {
  devClearDust,
  devDeliverMachine,
  devDismissTutorials,
  devGrantMoney,
  devGrantReputation,
  devGrantSupplies,
  devSkipHour,
  devSleepNow,
  devSpawnBoard,
  devSpawnPallet,
  devUnlockAllSkills,
  devUnlockChannels,
} from "./dev-commands";

/**
 * The dev menu's cheats. They skip player-facing validation on purpose,
 * but each must still land its mutation on the right singleton or
 * entity and leave a world the ordinary systems can keep ticking.
 */

function shopWith(overrides: Partial<GameState> = {}): ShopDriver {
  return new ShopDriver({ state: { ...initialGameState, ...overrides } });
}

describe("dev grants", () => {
  it("mints money and reputation", () => {
    const shop = shopWith({ money: 5, reputation: 1 });
    devGrantMoney(shop.game, 100);
    devGrantReputation(shop.game, 5);
    assert.strictEqual(shop.wallet.money, 105);
    assert.strictEqual(shop.reputation.reputation, 6);
  });

  it("tops up consumables and clamps", () => {
    const shop = shopWith();
    devGrantSupplies(shop.game, [{ id: "nails", amount: 100 }], 4);
    assert.strictEqual(shop.consumables.stock.nails, 100);
    assert.strictEqual(shop.consumables.clamps, 4);
  });
});

describe("dev unlocks", () => {
  it("opens every channel and every article", () => {
    const shop = shopWith();
    devUnlockChannels(shop.game);
    assert.ok(shop.progression.storeUnlocked);
    assert.ok(shop.progression.lumberyardUnlocked);
    assert.ok(shop.progression.sweepingUnlocked);
    assert.deepStrictEqual(shop.progression.unlockedArticles, [
      ...ALL_ARTICLE_IDS,
    ]);
  });

  it("grants the whole skill tree", () => {
    const shop = shopWith();
    devUnlockAllSkills(shop.game);
    assert.deepStrictEqual(shop.progression.unlockedSkills, [...SKILL_IDS]);
  });

  it("dismisses every tutorial track", () => {
    const shop = shopWith();
    devDismissTutorials(shop.game);
    for (const progress of Object.values(shop.tutorials.tutorials)) {
      assert.ok(progress.dismissed);
    }
  });
});

describe("dev world edits", () => {
  it("clears the dust map", () => {
    const shop = shopWith();
    shop.dustLayer.map = { "1,1": { pine: 3 } };
    devClearDust(shop.game);
    assert.deepStrictEqual(shop.dustLayer.map, {});
  });

  it("lands a spawned board and pallet as piles", () => {
    const shop = shopWith();
    devSpawnBoard(shop.game, "walnut", "rough");
    devSpawnBoard(shop.game, "maple", "milled");
    devSpawnPallet(shop.game);
    const materials = shop.piles.map((pile) => pile.material);
    assert.strictEqual(materials.length, 3);
    const milled = materials.find(
      (material) => material.type === "board" && material.species === "maple",
    );
    assert.ok(milled?.type === "board");
    assert.strictEqual(milled.surface, "sanded");
    assert.strictEqual(milled.jointedFaces, 2);
    assert.ok(materials.some((material) => material.type === "pallet"));
  });

  it("delivers a crated machine to the floor", () => {
    const shop = shopWith();
    devDeliverMachine(shop.game, "miterSaw");
    assert.ok(
      shop.shop.machineCrates.some(
        (crate) => crate.machine.machineTypeId === "miterSaw",
      ),
    );
  });
});

describe("dev time", () => {
  it("queues an hour of forced minutes", () => {
    const shop = shopWith();
    devSkipHour(shop.game);
    assert.strictEqual(shop.timeFlow.pendingForcedMinutes, 60);
  });

  it("puts the player to bed from anywhere, and the night still runs", () => {
    const shop = shopWith();
    assert.ok(devSleepNow(shop.game));
    assert.deepStrictEqual(shop.player.away, { kind: "home" });
    // Refused while already away.
    assert.strictEqual(devSleepNow(shop.game), false);
    const day = shop.clock.day;
    shop.sleep();
    assert.strictEqual(shop.clock.day, day + 1);
  });
});
