import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { CartLine, cartTotal, groupCartLines } from "../cart";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { MACHINE_TYPES } from "../Machine";
import { addToCartAction, currentCart } from "./cart-actions";

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
const SAW: CartLine = {
  kind: "machine",
  machineTypeId: "miterSaw",
  price: MACHINE_TYPES.miterSaw.cost,
};
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
        hasCart: true,
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
