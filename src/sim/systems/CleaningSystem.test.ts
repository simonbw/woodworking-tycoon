import assert from "node:assert";
import { describe, it } from "node:test";
import { dustTotal } from "../../game/Dust";
import { BROOM_COST } from "../../game/HeldTool";
import { GameState } from "../../game/GameState";
import {
  DUSTPAN_CAPACITY,
  DUSTPAN_EMPTY_RATE,
} from "../../game/game-actions/dust-actions";
import { initialGameState } from "../../game/initialGameState";
import { makePallet } from "../../game/material-helpers";
import { BASE_WALK_SPEED } from "../../game/player-motion";
import {
  SHOP_VAC_CANISTER_CAPACITY,
  SHOP_VAC_COST,
  SHOP_VAC_EMPTY_RATE,
} from "../../game/ShopVac";
import { ShopDriver } from "../driver/ShopDriver";

/**
 * The cleaning system's contract, ported from the old world's promises
 * (`dust-actions.test.ts`, `shop-vac-actions.test.ts`, and the core of
 * `sequences/cleaning-chain.test.ts`): sweeping gathers the swath into
 * the dustpan paced by the stroke cap and slows the walk, the pan and
 * the vac canister cap out and empty a chunk per held tick at the
 * garbage can, the vac trickles underfoot while dragged, held tool work
 * spends the player's time, and the whole slice round-trips through the
 * save file byte-identically.
 *
 * Numbers follow the old `tickAction` pipeline (sweep → vacuum → shop
 * vac in one minute), not the isolated per-pass unit tests — where a
 * minute runs both the suction and the trickle, the expectation composes
 * them, exactly as the old full tick did.
 */

const close = (a: number, b: number, message?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, message ?? `expected ${a} ≈ ${b}`);

/**
 * Broom in hand mid-shop at [6,8] facing +x — one held stroke away. The
 * default shop's workspace occupies [1..3, 1..2] and the garbage can
 * [0..1, 13..14], both well outside the swath.
 */
function sweepingShop(overrides: Partial<GameState> = {}): ShopDriver {
  const shop = new ShopDriver({
    state: {
      ...initialGameState,
      broomOwned: true,
      broomPosition: null,
      player: { ...initialGameState.player, position: [6, 8], direction: 0 },
      ...overrides,
    },
  });
  return shop;
}

/** Dragging the vac at [2,4] facing -y, so the workspace sits in the swath. */
function draggingShop(overrides: Partial<GameState> = {}): ShopDriver {
  return new ShopDriver({
    state: {
      ...initialGameState,
      shopVac: { position: null, canister: {} },
      player: { ...initialGameState.player, position: [2, 4], direction: 1 },
      ...overrides,
    },
  });
}

describe("sweeping", () => {
  it("gathers swath dust into the dustpan, paced by the stroke cap", () => {
    const shop = sweepingShop({
      dust: { "7,8": { walnut: 10 }, "8,8": { oak: 10 } },
    });
    shop.holdOperate(true).tick(1);
    // The stroke wants 90% of each cell (18 units) but the tick cap is
    // 8, taken proportionally: each cell gives up 4
    close(shop.dustLayer.map["7,8"]?.walnut ?? 0, 6);
    close(shop.dustLayer.map["8,8"]?.oak ?? 0, 6);
    close(dustTotal(shop.broom.dustpan), 8);
    close(shop.broom.dustpan.walnut ?? 0, 4);
    // Sweeping never freezes the feet
    assert.strictEqual(shop.player.busyTicks, 0);
    // A heavy tick earns token XP (and would bank its level-ups)
    assert.strictEqual(shop.progression.xp, 1);
  });

  it("does nothing unless the operate key is held", () => {
    const shop = sweepingShop({ dust: { "7,8": { walnut: 10 } } });
    shop.tick(1);
    close(shop.dustLayer.map["7,8"]?.walnut ?? 0, 10);
    assert.deepStrictEqual(shop.broom.dustpan, {});
  });

  it("does nothing while the player is still busy", () => {
    const shop = sweepingShop({
      dust: { "7,8": { walnut: 10 } },
      player: {
        ...initialGameState.player,
        position: [6, 8],
        direction: 0,
        busyTicks: 5,
      },
    });
    shop.holdOperate(true).tick(1);
    close(shop.dustLayer.map["7,8"]?.walnut ?? 0, 10);
  });

  it("pulls dust from under machines in reach at a reduced rate", () => {
    // The workspace occupies [1..3, 1..2]; standing at [2,4] facing -y
    // (direction 1) puts its cells in the swath.
    const shop = sweepingShop({
      dust: { "2,2": { pine: 20 } },
      player: { ...initialGameState.player, position: [2, 4], direction: 1 },
    });
    shop.holdOperate(true).tick(1);
    close(shop.dustLayer.map["2,2"]?.pine ?? 0, 14);
  });

  it("stops gathering at a full pan, leaving the rest on the floor", () => {
    const shop = sweepingShop({
      dust: { "6,8": { walnut: 10 } },
      dustpan: { oak: DUSTPAN_CAPACITY - 5 },
    });
    shop.holdOperate(true).tick(1);
    // Only 5 of the 9 the stroke would take fit in the pan
    close(dustTotal(shop.broom.dustpan), DUSTPAN_CAPACITY);
    close(dustTotal(shop.dustLayer.map["6,8"]), 5);
  });

  it("is a no-op with a completely full pan", () => {
    const shop = sweepingShop({
      dust: { "7,8": { walnut: 10 } },
      dustpan: { oak: DUSTPAN_CAPACITY },
    });
    shop.holdOperate(true).tick(1);
    close(shop.dustLayer.map["7,8"]?.walnut ?? 0, 10);
  });

  it("empties the pan a chunk per tick next to the garbage can", () => {
    // The garbage can occupies [0..1, 13..14]; [2,13] touches it
    const shop = sweepingShop({
      dustpan: { walnut: 60, oak: 40 },
      player: { ...initialGameState.player, position: [2, 13], direction: 1 },
    });
    shop.holdOperate(true).tick(1);
    close(dustTotal(shop.broom.dustpan), 100 - DUSTPAN_EMPTY_RATE);
    // Species drain proportionally
    close(shop.broom.dustpan.walnut ?? 0, 48);
    // Holding on empties it completely
    for (let i = 0; i < 10; i++) {
      shop.tick(1);
    }
    assert.deepStrictEqual(shop.broom.dustpan, {});
  });

  it("a mouse aim steers the swath to the aimed patch", () => {
    // [6,6] is out of the facing swath (facing +x) but within reach
    const shop = sweepingShop({
      dust: { "6,6": { walnut: 10 }, "5,5": { oak: 10 } },
    });
    shop.sweep([6, 6]);
    close(shop.dustLayer.map["6,6"]?.walnut ?? 0, 6);
    close(shop.dustLayer.map["5,5"]?.oak ?? 0, 6);
    close(dustTotal(shop.broom.dustpan), 8);
  });

  it("ignores an aim beyond arm's reach", () => {
    const shop = sweepingShop({
      dust: { "7,8": { walnut: 10 }, "0,0": { oak: 10 } },
    });
    shop.sweep([0, 0]);
    // Falls back to the facing swath; the far cell is untouched
    close(shop.dustLayer.map["7,8"]?.walnut ?? 0, 2);
    close(shop.dustLayer.map["0,0"]?.oak ?? 0, 10);
  });

  it("grants no XP for token ticks", () => {
    const shop = sweepingShop({ dust: { "7,8": { walnut: 2 } } });
    shop.holdOperate(true).tick(1);
    assert.strictEqual(shop.progression.xp, 0);
  });
});

describe("the shop vac", () => {
  it("suction pulls the swath into the canister, undersides included", () => {
    const shop = draggingShop({
      dust: { "2,4": { walnut: 10 }, "2,2": { pine: 10 } },
    });
    shop.holdOperate(true).tick(1);
    // Suction: underfoot at the strong rate (10 → 1), under the
    // workspace at the cone rate (10 → 5.5); the passive trickle in the
    // same minute then drinks the last unit underfoot — exactly what
    // the old tickAction's vacuum-then-trickle order did.
    assert.strictEqual(shop.dustLayer.map["2,4"], undefined);
    close(shop.dustLayer.map["2,2"]?.pine ?? 0, 5.5);
    close(dustTotal(shop.shopVac!.canister), 14.5);
    assert.strictEqual(shop.player.busyTicks, 0);
  });

  it("trickle-cleans the cell underfoot while dragging, no key held", () => {
    const shop = draggingShop({ dust: { "2,4": { walnut: 50 } } });
    shop.tick(1);
    close(shop.dustLayer.map["2,4"]?.walnut ?? 0, 44);
    close(shop.shopVac!.canister.walnut ?? 0, 6);
  });

  it("leaves a parked vac alone", () => {
    const shop = draggingShop({
      dust: { "2,4": { walnut: 50 } },
      shopVac: { position: [2, 4], canister: {} },
    });
    shop.holdOperate(true).tick(1);
    close(shop.dustLayer.map["2,4"]?.walnut ?? 0, 50);
    assert.deepStrictEqual(shop.shopVac!.canister, {});
  });

  it("a full canister kills the suction", () => {
    const shop = draggingShop({
      dust: { "2,4": { walnut: 10 } },
      shopVac: {
        position: null,
        canister: { oak: SHOP_VAC_CANISTER_CAPACITY },
      },
    });
    shop.holdOperate(true).tick(1);
    close(shop.dustLayer.map["2,4"]?.walnut ?? 0, 10);
  });

  it("the same hold empties the canister beside the garbage can", () => {
    // [0,12] touches the garbage can's top edge
    const shop = draggingShop({
      shopVac: {
        position: null,
        canister: { walnut: SHOP_VAC_EMPTY_RATE * 2 },
      },
      player: { ...initialGameState.player, position: [0, 12], direction: 1 },
    });
    shop.holdOperate(true).tick(1);
    close(dustTotal(shop.shopVac!.canister), SHOP_VAC_EMPTY_RATE);
    shop.tick(1);
    assert.deepStrictEqual(shop.shopVac!.canister, {});
  });

  it("never dumps the canister on its own — emptying is deliberate", () => {
    const shop = draggingShop({
      shopVac: { position: null, canister: { walnut: 123 } },
      player: { ...initialGameState.player, position: [0, 12], direction: 1 },
    });
    shop.tick(3);
    close(dustTotal(shop.shopVac!.canister), 123);
  });
});

describe("cleaning commands", () => {
  it("buys the broom to the dropoff spot for its price", () => {
    const shop = new ShopDriver({
      state: { ...initialGameState, money: BROOM_COST + 10 },
    });
    shop.buyBroom();
    assert.strictEqual(shop.wallet.money, 10);
    assert.strictEqual(shop.broom.owned, true);
    assert.deepStrictEqual(shop.broom.position, [10, 13]);
    // Buying twice refuses
    shop.buyBroom();
    assert.strictEqual(shop.wallet.money, 10);
  });

  it("refuses the broom when broke", () => {
    const shop = new ShopDriver({
      state: { ...initialGameState, money: BROOM_COST - 1 },
    });
    shop.buyBroom();
    assert.strictEqual(shop.broom.owned, false);
    assert.strictEqual(shop.wallet.money, BROOM_COST - 1);
  });

  it("takes the leaning broom into the hands, within reach only", () => {
    const shop = sweepingShop({ broomPosition: [6, 9] });
    shop.grabBroom();
    assert.strictEqual(shop.broom.position, null);
    assert.strictEqual(shop.broom.inHand, true);
  });

  it("won't reach a broom across the shop", () => {
    const shop = sweepingShop({ broomPosition: [0, 0] });
    shop.grabBroom();
    assert.deepStrictEqual(shop.broom.position, [0, 0]);
  });

  it("needs empty hands for the broom", () => {
    const shop = sweepingShop({
      broomPosition: [6, 9],
      player: {
        ...initialGameState.player,
        position: [6, 8],
        direction: 0,
        inventory: [makePallet()],
      },
    });
    shop.grabBroom();
    assert.deepStrictEqual(shop.broom.position, [6, 9]);
  });

  it("leans the broom where the player stands, pan contents and all", () => {
    const shop = sweepingShop({ dustpan: { walnut: 30 } });
    shop.leanBroom();
    assert.deepStrictEqual(shop.broom.position, [6, 8]);
    assert.deepStrictEqual(shop.broom.dustpan, { walnut: 30 });
  });

  it("buys the vac to the dropoff spot for its price", () => {
    const shop = new ShopDriver({
      state: { ...initialGameState, money: SHOP_VAC_COST },
    });
    shop.buyShopVac();
    assert.strictEqual(shop.wallet.money, 0);
    assert.deepStrictEqual(shop.shopVac?.position, [10, 13]);
    assert.deepStrictEqual(shop.shopVac?.canister, {});
    // Buying twice refuses
    shop.buyShopVac();
    assert.strictEqual(shop.wallet.money, 0);
  });

  it("grabs the vac standing by it, parks it underfoot while dragging", () => {
    const shop = draggingShop();
    shop.toggleVacHose();
    assert.deepStrictEqual(shop.shopVac?.position, [2, 4]);
    shop.toggleVacHose();
    assert.strictEqual(shop.shopVac?.position, null);
  });

  it("cannot grab the vac from a distance", () => {
    const shop = draggingShop({ shopVac: { position: [6, 8], canister: {} } });
    shop.toggleVacHose();
    assert.deepStrictEqual(shop.shopVac?.position, [6, 8]);
  });

  it("the hose and the broom exclude each other", () => {
    // Broom in hand: the vac's hose refuses
    const withBroom = draggingShop({
      broomOwned: true,
      broomPosition: null,
      shopVac: { position: [2, 4], canister: {} },
    });
    withBroom.toggleVacHose();
    assert.deepStrictEqual(withBroom.shopVac?.position, [2, 4]);
    // Hose in hand: the broom refuses
    const withHose = draggingShop({
      broomOwned: true,
      broomPosition: [2, 5],
    });
    withHose.grabBroom();
    assert.deepStrictEqual(withHose.broom.position, [2, 5]);
  });
});

describe("cleaning and the clock", () => {
  it("a held tool stroke counts as working", () => {
    const shop = sweepingShop();
    assert.strictEqual(shop.timeFlow.resolveSpeed(), "idle");
    shop.holdOperate(true);
    assert.strictEqual(shop.timeFlow.resolveSpeed(), "working");
    shop.holdOperate(false);
    assert.strictEqual(shop.timeFlow.resolveSpeed(), "idle");
  });

  it("the hold spends nothing without a tool in hand", () => {
    const shop = new ShopDriver({ state: initialGameState });
    shop.holdOperate(true);
    assert.strictEqual(shop.timeFlow.resolveSpeed(), "idle");
  });
});

describe("cleaning and the walk", () => {
  it("dragging the vac halves walking speed", () => {
    const shop = draggingShop();
    shop.stepEngine(1);
    assert.strictEqual(shop.player.walkSpeed(), BASE_WALK_SPEED / 2);
  });

  it("an active sweep slows the stride", () => {
    const shop = sweepingShop();
    shop.stepEngine(1);
    close(shop.player.walkSpeed(), BASE_WALK_SPEED);
    shop.holdOperate(true);
    close(shop.player.walkSpeed(), BASE_WALK_SPEED / 1.6);
  });

  it("deep sawdust underfoot is heavy going", () => {
    const shop = new ShopDriver({
      state: { ...initialGameState, dust: { "6,12": { walnut: 15 } } },
    });
    shop.stepEngine(1);
    // A full cell underfoot: the +300% ramp tops out
    close(shop.player.walkSpeed(), BASE_WALK_SPEED / 4);
  });
});

describe("serialization", () => {
  it("round-trips the broom, pan, vac, and dust byte-identically", () => {
    const shop = sweepingShop({
      broomPosition: [3, 3],
      dustpan: { oak: 12.5 },
      dust: { "2,2": { pine: 1.25 } },
      shopVac: { position: [5, 5], canister: { walnut: 3 } },
    });
    const save = shop.save();
    const reloaded = new ShopDriver({ save });
    assert.strictEqual(JSON.stringify(reloaded.save()), JSON.stringify(save));
    assert.deepStrictEqual(reloaded.broom.position, [3, 3]);
    assert.deepStrictEqual(reloaded.broom.dustpan, { oak: 12.5 });
    assert.deepStrictEqual(reloaded.shopVac?.position, [5, 5]);
    assert.deepStrictEqual(reloaded.shopVac?.canister, { walnut: 3 });
  });

  it("keeps the vac absent until it's bought", () => {
    const fresh = new ShopDriver();
    assert.strictEqual(fresh.shopVac, null);
    const reloaded = new ShopDriver({ save: fresh.save() });
    assert.strictEqual(reloaded.shopVac, null);
    assert.strictEqual(reloaded.broom.owned, false);
  });
});
