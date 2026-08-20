import assert from "node:assert";
import { describe, it } from "node:test";
import { CLAMP_COST } from "../../game/Clamp";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { UPGRADE_TYPES } from "../../game/Upgrade";
import { ShopDriver } from "../driver/ShopDriver";
import { buyClamp, buyUpgrade } from "./store-commands";

/**
 * The purchases that don't ride home in the truck's bed: a clamp goes
 * straight onto the rack, an upgrade straight into upgrade storage.
 * Each rings up at its registry price, and refuses quietly when the
 * money isn't there.
 */

function shopWith(overrides: Partial<GameState> = {}): ShopDriver {
  return new ShopDriver({ state: { ...initialGameState, ...overrides } });
}

describe("buying a clamp", () => {
  it("charges for the clamp and hangs it on the rack", () => {
    const shop = shopWith({ money: 50, clamps: 2 });
    assert.ok(buyClamp(shop.game));
    assert.strictEqual(shop.wallet.money, 50 - CLAMP_COST);
    assert.strictEqual(shop.consumables.clamps, 3);
  });

  it("does nothing when the player can't afford one", () => {
    const shop = shopWith({ money: 1, clamps: 0 });
    assert.strictEqual(buyClamp(shop.game), false);
    assert.strictEqual(shop.wallet.money, 1);
    assert.strictEqual(shop.consumables.clamps, 0);
  });
});

describe("buying an upgrade", () => {
  it("moves money into upgrade storage", () => {
    const shop = shopWith({ money: 100 });
    assert.ok(buyUpgrade(shop.game, "vise"));
    assert.strictEqual(shop.wallet.money, 100 - UPGRADE_TYPES.vise.cost);
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["vise"]);
  });

  it("refuses a second one the shop can't afford", () => {
    const shop = shopWith({ money: UPGRADE_TYPES.vise.cost });
    assert.ok(buyUpgrade(shop.game, "vise"));
    assert.strictEqual(buyUpgrade(shop.game, "vise"), false);
    assert.strictEqual(shop.wallet.money, 0);
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["vise"]);
  });
});
