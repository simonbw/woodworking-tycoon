import assert from "node:assert";
import { describe, it } from "node:test";
import { dustTotal } from "../Dust";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { BASE_WALK_SPEED, playerWalkSpeed } from "../player-motion";
import {
  SHOP_VAC_CANISTER_CAPACITY,
  SHOP_VAC_COST,
  SHOP_VAC_EMPTY_RATE,
} from "../ShopVac";
import {
  buyShopVacAction,
  shopVacTickPass,
  toggleCarryShopVacAction,
  vacuumTickPass,
} from "./shop-vac-actions";
import { tickAction } from "./tickAction";

/**
 * Dragging the vac at [2,4], hose in hand and the operate key held —
 * one tick of suction away. Facing -y (direction 1), so the workspace at
 * [1..3, 1..2] sits inside the suction swath.
 */
function draggingState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialGameState,
    progression: { ...initialGameState.progression, sweepingUnlocked: true },
    shopVac: { position: null, canister: {} },
    player: {
      ...initialGameState.player,
      position: [2, 4],
      direction: 1,
      operating: true,
    },
    ...overrides,
  };
}

describe("buyShopVacAction", () => {
  it("delivers the vac to the dropoff spot and takes the money", () => {
    const result = buyShopVacAction()({
      ...initialGameState,
      money: SHOP_VAC_COST + 25,
    });
    assert.strictEqual(result.money, 25);
    assert.deepStrictEqual(
      result.shopVac?.position,
      initialGameState.shopInfo.materialDropoffPosition,
    );
    assert.deepStrictEqual(result.shopVac?.canister, {});
  });

  it("refuses when broke or already owned", () => {
    const broke = { ...initialGameState, money: SHOP_VAC_COST - 1 };
    assert.strictEqual(buyShopVacAction()(broke), broke);
    const owned = draggingState({ money: SHOP_VAC_COST });
    assert.strictEqual(buyShopVacAction()(owned), owned);
  });
});

describe("toggleCarryShopVacAction", () => {
  it("grabs the vac when standing on it", () => {
    const state = draggingState({
      shopVac: { position: [2, 4], canister: {} },
    });
    const result = toggleCarryShopVacAction()(state);
    assert.strictEqual(result.shopVac?.position, null);
  });

  it("parks it underfoot while dragging", () => {
    const result = toggleCarryShopVacAction()(draggingState());
    assert.deepStrictEqual(result.shopVac?.position, [2, 4]);
  });

  it("cannot grab from a distance", () => {
    const state = draggingState({
      shopVac: { position: [6, 8], canister: {} },
    });
    assert.strictEqual(toggleCarryShopVacAction()(state), state);
  });

  it("cannot grab the hose with the broom in hand", () => {
    const state = draggingState({
      shopVac: { position: [2, 4], canister: {} },
      broomOwned: true,
      broomPosition: null,
    });
    assert.strictEqual(toggleCarryShopVacAction()(state), state);
  });
});

describe("vacuumTickPass", () => {
  it("pulls the swath into the canister — machine undersides included", () => {
    const result = vacuumTickPass()(
      draggingState({
        dust: { "2,4": { walnut: 10 }, "2,2": { pine: 10 } },
      }),
    );
    // Underfoot at the strong rate; under the workspace at the cone rate
    assert.ok(Math.abs((result.dust["2,4"]?.walnut ?? 0) - 1) < 1e-9);
    assert.ok(Math.abs((result.dust["2,2"]?.pine ?? 0) - 5.5) < 1e-9);
    assert.ok(Math.abs(dustTotal(result.shopVac?.canister) - 13.5) < 1e-9);
    // Nobody's feet freeze
    assert.strictEqual(result.player.busyTicks, 0);
  });

  it("does nothing unless the operate key is held", () => {
    const state = draggingState({
      dust: { "2,4": { walnut: 10 } },
      player: { ...draggingState().player, operating: false },
    });
    assert.strictEqual(vacuumTickPass()(state), state);
  });

  it("does nothing while the vac is parked", () => {
    const state = draggingState({
      dust: { "2,4": { walnut: 10 } },
      shopVac: { position: [5, 5], canister: {} },
    });
    assert.strictEqual(vacuumTickPass()(state), state);
  });

  it("a full canister kills the suction", () => {
    const state = draggingState({
      dust: { "2,4": { walnut: 10 } },
      shopVac: {
        position: null,
        canister: { oak: SHOP_VAC_CANISTER_CAPACITY },
      },
    });
    assert.strictEqual(vacuumTickPass()(state), state);
  });

  it("stops taking at the canister's capacity", () => {
    const nearlyFull = SHOP_VAC_CANISTER_CAPACITY - 3;
    const result = vacuumTickPass()(
      draggingState({
        dust: { "2,4": { walnut: 10 } },
        shopVac: { position: null, canister: { oak: nearlyFull } },
      }),
    );
    assert.ok(
      Math.abs(
        dustTotal(result.shopVac?.canister) - SHOP_VAC_CANISTER_CAPACITY,
      ) < 1e-9,
    );
    assert.ok(Math.abs((result.dust["2,4"]?.walnut ?? 0) - 7) < 1e-9);
  });

  it("the same hold empties the canister beside the garbage can", () => {
    // The garbage can occupies [0..1, 13..14]; [0,12] touches its top edge
    const state = draggingState({
      shopVac: { position: null, canister: { walnut: SHOP_VAC_EMPTY_RATE * 2 } },
      player: {
        ...draggingState().player,
        position: [0, 12],
      },
    });
    const once = vacuumTickPass()(state);
    assert.ok(
      Math.abs(dustTotal(once.shopVac?.canister) - SHOP_VAC_EMPTY_RATE) < 1e-9,
    );
    const twice = vacuumTickPass()(once);
    assert.deepStrictEqual(twice.shopVac?.canister, {});
  });
});

describe("shopVacTickPass", () => {
  it("trickle-cleans the cell underfoot while dragging", () => {
    const result = shopVacTickPass()(
      draggingState({ dust: { "2,4": { walnut: 50 } } }),
    );
    assert.ok(Math.abs((result.dust["2,4"]?.walnut ?? 0) - 44) < 1e-9);
    assert.ok(Math.abs((result.shopVac?.canister.walnut ?? 0) - 6) < 1e-9);
  });

  it("never dumps the canister on its own — emptying is deliberate", () => {
    const state = draggingState({
      shopVac: { position: null, canister: { walnut: 123 } },
      player: {
        ...draggingState().player,
        position: [0, 12],
        operating: false,
      },
    });
    const result = tickAction(state);
    assert.ok(
      Math.abs(dustTotal(result.shopVac?.canister) - 123) < 1e-9,
      "standing at the can without holding the key should keep the load",
    );
  });

  it("leaves a parked vac alone", () => {
    const state = draggingState({
      dust: { "2,4": { walnut: 50 } },
      shopVac: { position: [2, 4], canister: {} },
    });
    assert.strictEqual(shopVacTickPass()(state), state);
  });
});

describe("dragging the vac through the shop", () => {
  it("halves walking speed", () => {
    assert.strictEqual(playerWalkSpeed(draggingState()), BASE_WALK_SPEED / 2);
  });
});
