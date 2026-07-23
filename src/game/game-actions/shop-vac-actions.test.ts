import assert from "node:assert";
import { describe, it } from "node:test";
import { dustTotal } from "../Dust";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { BASE_WALK_SPEED, playerWalkSpeed } from "../player-motion";
import { SHOP_VAC_CANISTER_CAPACITY, SHOP_VAC_COST } from "../ShopVac";
import {
  buyShopVacAction,
  shopVacTickPass,
  toggleCarryShopVacAction,
  vacuumAction,
} from "./shop-vac-actions";
import { tickAction } from "./tickAction";

/** Dragging the vac at [1,1] (the workspace is the neighbor at [1,2]). */
function draggingState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialGameState,
    progression: { ...initialGameState.progression, sweepingUnlocked: true },
    shopVac: { position: null, canister: {} },
    player: { ...initialGameState.player, position: [1, 1], direction: 0 },
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
      shopVac: { position: [1, 1], canister: {} },
    });
    const result = toggleCarryShopVacAction()(state);
    assert.strictEqual(result.shopVac?.position, null);
  });

  it("parks it underfoot while dragging", () => {
    const result = toggleCarryShopVacAction()(draggingState());
    assert.deepStrictEqual(result.shopVac?.position, [1, 1]);
  });

  it("cannot grab from a distance", () => {
    const state = draggingState({
      shopVac: { position: [3, 5], canister: {} },
    });
    assert.strictEqual(toggleCarryShopVacAction()(state), state);
  });
});

describe("vacuumAction", () => {
  it("cleans underfoot to zero and neighbors — machines included — hard", () => {
    const result = vacuumAction()(
      draggingState({
        dust: { "1,1": { walnut: 50 }, "1,2": { pine: 20 } },
      }),
    );
    // Underfoot: gone entirely. Under the workspace: 60% gone.
    assert.strictEqual(result.dust["1,1"], undefined);
    assert.ok(Math.abs((result.dust["1,2"]?.pine ?? 0) - 8) < 1e-9);
    assert.ok(Math.abs(dustTotal(result.shopVac?.canister) - 62) < 1e-9);
    assert.strictEqual(result.player.busyTicks, 1);
    assert.strictEqual(result.player.canWork, false);
    assert.strictEqual(result.progression.xp, 1);
  });

  it("stops at the canister's capacity", () => {
    const nearlyFull = SHOP_VAC_CANISTER_CAPACITY - 10;
    const result = vacuumAction()(
      draggingState({
        dust: { "1,1": { walnut: 50 } },
        shopVac: { position: null, canister: { oak: nearlyFull } },
      }),
    );
    assert.ok(
      Math.abs(
        dustTotal(result.shopVac?.canister) - SHOP_VAC_CANISTER_CAPACITY,
      ) < 1e-9,
    );
    assert.ok(Math.abs((result.dust["1,1"]?.walnut ?? 0) - 40) < 1e-9);
  });

  it("does nothing while the vac is parked", () => {
    const state = draggingState({
      dust: { "1,1": { walnut: 50 } },
      shopVac: { position: [0, 0], canister: {} },
    });
    assert.strictEqual(vacuumAction()(state), state);
  });
});

describe("shopVacTickPass", () => {
  it("trickle-cleans the cell underfoot while dragging", () => {
    const result = shopVacTickPass()(
      draggingState({ dust: { "1,1": { walnut: 50 } } }),
    );
    assert.ok(Math.abs((result.dust["1,1"]?.walnut ?? 0) - 44) < 1e-9);
    assert.ok(Math.abs((result.shopVac?.canister.walnut ?? 0) - 6) < 1e-9);
  });

  it("dumps the canister next to the garbage can", () => {
    // The garbage can sits at [0,5]; standing at [0,4] is adjacent
    const result = shopVacTickPass()(
      draggingState({
        shopVac: { position: null, canister: { walnut: 123 } },
        player: { ...initialGameState.player, position: [0, 4], direction: 0 },
      }),
    );
    assert.deepStrictEqual(result.shopVac?.canister, {});
  });

  it("leaves a parked vac alone", () => {
    const state = draggingState({
      dust: { "1,1": { walnut: 50 } },
      shopVac: { position: [1, 1], canister: {} },
    });
    assert.strictEqual(shopVacTickPass()(state), state);
  });
});

describe("dragging the vac through the shop", () => {
  it("halves walking speed", () => {
    assert.strictEqual(playerWalkSpeed(draggingState()), BASE_WALK_SPEED / 2);
  });

  it("vacuums instead of sweeping on the clean-up key", () => {
    let state = draggingState({
      dust: { "1,1": { walnut: 50 } },
      player: {
        ...initialGameState.player,
        position: [1, 1],
        direction: 0,
        workQueue: [{ type: "sweep" }],
      },
    });
    state = tickAction(state);
    // Vacuumed into the canister — no sawdust pile appears
    assert.ok((state.shopVac?.canister.walnut ?? 0) > 40);
    assert.ok(
      !state.materialPiles.some((pile) => pile.material.type === "sawdustPile"),
    );
  });
});
