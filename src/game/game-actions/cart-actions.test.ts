import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { CartLine, cartTotal, groupCartLines } from "../cart";
import { CLAMP_COST } from "../Clamp";
import { CONSUMABLE_TYPES } from "../Consumable";
import { GameState } from "../GameState";
import { BROOM_COST } from "../HeldTool";
import { initialGameState } from "../initialGameState";
import { MACHINE_TYPES } from "../Machine";
import { SHOP_VAC_COST } from "../ShopVac";
import {
  addToCartAction,
  canCheckOut,
  checkoutAction,
  clearCartAction,
  currentCart,
  removeFromCartAction,
} from "./cart-actions";
import { returnFromStoreAction } from "./door-actions";

// Prices come off the same registries the shelf tags read, because
// that's the invariant worth protecting: some buy actions take the
// price they're handed and some look it up themselves, so a line
// carrying a made-up number would charge one figure and promise
// another. "checkout takes exactly the cart's total" below is what
// holds those two together.
const PINE: CartLine = {
  kind: "material",
  material: board("pine", 96, 4, 8, "smooth"),
  price: 20,
};
const NAILS: CartLine = {
  kind: "consumablePack",
  consumableId: "nails",
  price: CONSUMABLE_TYPES.nails.packPrice,
};
const SAW: CartLine = {
  kind: "machine",
  machineTypeId: "miterSaw",
  price: MACHINE_TYPES.miterSaw.cost,
};
const CLAMP: CartLine = { kind: "clamp", price: CLAMP_COST };
const BROOM: CartLine = { kind: "broom", price: BROOM_COST };
const VAC: CartLine = { kind: "shopVac", price: SHOP_VAC_COST };

/** A shop mid-trip, standing in an aisle with the given cart. */
function atStore(money: number, cart: ReadonlyArray<CartLine> = []): GameState {
  return {
    ...initialGameState,
    money,
    player: {
      ...initialGameState.player,
      away: {
        kind: "shopping",
        store: "orangeBox",
        cart,
        position: [0, 0],
        direction: 1,
      },
    },
  };
}

function cartOf(state: GameState): ReadonlyArray<CartLine> {
  return currentCart(state) ?? [];
}

describe("addToCartAction", () => {
  it("puts a line in the cart without touching the money", () => {
    const result = addToCartAction(PINE)(atStore(100));
    assert.strictEqual(result.money, 100);
    assert.strictEqual(cartOf(result).length, 1);
    assert.strictEqual(cartTotal(cartOf(result)), 20);
  });

  it("stamps each material its own id, so two boards are two boards", () => {
    let state = addToCartAction(PINE)(atStore(100));
    state = addToCartAction(PINE)(state);
    const [first, second] = cartOf(state);
    assert.strictEqual(cartOf(state).length, 2);
    assert.notStrictEqual(
      (first as { material: { id: string } }).material.id,
      (second as { material: { id: string } }).material.id,
    );
    // ...and still read as one product with a count of two
    assert.deepStrictEqual(
      groupCartLines(cartOf(state)).map((group) => group.count),
      [2],
    );
  });

  it("lets the cart outrun the wallet — the register is what refuses", () => {
    const result = addToCartAction(SAW)(atStore(10));
    assert.strictEqual(cartOf(result).length, 1);
    assert.strictEqual(canCheckOut(result), false);
  });

  it("refuses a second broom — there is only ever one to a shop", () => {
    const broom: CartLine = { kind: "broom", price: 15 };
    const once = addToCartAction(broom)(atStore(100));
    const twice = addToCartAction(broom)(once);
    assert.strictEqual(cartOf(twice).length, 1);
  });

  it("does nothing when the player isn't at a store", () => {
    const home = initialGameState;
    assert.strictEqual(addToCartAction(PINE)(home), home);
  });
});

describe("removeFromCartAction / clearCartAction", () => {
  it("puts one line back on the shelf", () => {
    const state = atStore(100, [PINE, NAILS]);
    const result = removeFromCartAction(0)(state);
    assert.deepStrictEqual(
      cartOf(result).map((line) => line.kind),
      ["consumablePack"],
    );
  });

  it("ignores an index that isn't in the cart", () => {
    const state = atStore(100, [PINE]);
    assert.strictEqual(removeFromCartAction(4)(state), state);
  });

  it("empties the whole cart", () => {
    const result = clearCartAction()(atStore(100, [PINE, NAILS, SAW]));
    assert.deepStrictEqual(cartOf(result), []);
  });
});

describe("checkoutAction", () => {
  it("rings every line up through its own buy action, then empties", () => {
    const result = checkoutAction()(atStore(1000, [PINE, NAILS, SAW]));

    // Each kind lands where that kind lands: stock in the bed, machines
    // crated in the bed, supplies straight into the shop's stock
    assert.strictEqual(result.truck.bed.length, 1);
    assert.strictEqual(result.truck.bed[0].type, "board");
    assert.deepStrictEqual(
      result.truck.crates.map((crate) => crate.machineTypeId),
      ["miterSaw"],
    );
    assert.strictEqual(
      result.consumables.nails,
      initialGameState.consumables.nails + CONSUMABLE_TYPES.nails.packSize,
    );
    assert.deepStrictEqual(cartOf(result), []);
  });

  it("takes exactly the total the cart was showing, kind by kind", () => {
    // Every kind of line at once: whatever a buy action charges has to
    // be the number the header quoted, or the store lies to the player.
    const cart = [PINE, NAILS, SAW, CLAMP, BROOM, VAC];
    const result = checkoutAction()(atStore(2000, cart));
    assert.strictEqual(result.money, 2000 - cartTotal(cart));
  });

  it("refuses the whole cart when it outruns the wallet", () => {
    const state = atStore(100, [PINE, SAW]);
    const result = checkoutAction()(state);
    assert.strictEqual(result.money, 100);
    assert.strictEqual(result.truck.bed.length, 0);
    assert.strictEqual(cartOf(result).length, 2);
  });

  it("takes a cart that costs exactly the wallet", () => {
    const result = checkoutAction()(atStore(20, [PINE]));
    assert.strictEqual(result.money, 0);
    assert.strictEqual(result.truck.bed.length, 1);
  });

  it("does nothing when the player isn't at a store", () => {
    const home = initialGameState;
    assert.strictEqual(checkoutAction()(home), home);
  });
});

describe("driving away", () => {
  it("leaves an unpaid cart behind with the trip", () => {
    const result = returnFromStoreAction(() => 0.5)(atStore(100, [PINE, SAW]));
    assert.strictEqual(result.player.away, null);
    assert.strictEqual(result.money, 100);
    assert.strictEqual(result.truck.bed.length, 0);
  });
});
