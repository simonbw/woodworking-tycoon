import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../../game/board-helpers";
import { CartLine, cartTotal, groupCartLines } from "../../game/cart";
import { MACHINE_TYPES } from "../../game/Machine";
import { ShopDriver } from "../driver/ShopDriver";
import { addToCart, currentCart } from "./cart-commands";

/**
 * What the shelf does to the cart, one line at a time. The cart's other
 * verbs — removing a line, clearing it, and the register's all-or-nothing
 * checkout — run as part of a whole store run in trip-commands.test.ts.
 *
 * Prices come off the same registries the shelf tags read, because that's
 * the invariant worth protecting: some buy commands take the price
 * they're handed and some look it up themselves, so a line carrying a
 * made-up number would charge one figure and promise another.
 */

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
const BROOM: CartLine = { kind: "broom", price: 15 };

/** A shop mid-trip, standing in an aisle with a flatbed in hand. */
function atStore(money: number): ShopDriver {
  const shop = new ShopDriver();
  shop.progression.storeUnlocked = true;
  shop.wallet.money = money;
  return shop.goShopping("orangeBox").takeCart();
}

function cartOf(shop: ShopDriver): ReadonlyArray<CartLine> {
  return currentCart(shop.game) ?? [];
}

describe("addToCart", () => {
  it("puts a line in the cart without touching the money", () => {
    const shop = atStore(100);
    assert.ok(addToCart(shop.game, PINE));
    assert.strictEqual(shop.wallet.money, 100);
    assert.strictEqual(cartOf(shop).length, 1);
    assert.strictEqual(cartTotal(cartOf(shop)), 20);
  });

  it("stamps each material its own id, so two boards are two boards", () => {
    const shop = atStore(100);
    addToCart(shop.game, PINE);
    addToCart(shop.game, PINE);
    const [first, second] = cartOf(shop);
    assert.strictEqual(cartOf(shop).length, 2);
    assert.ok(
      first.kind === "material" &&
        second.kind === "material" &&
        first.material.id !== second.material.id,
    );
    // ...and still read as one product with a count of two
    assert.deepStrictEqual(
      groupCartLines(cartOf(shop)).map((group) => group.count),
      [2],
    );
  });

  it("lets the cart outrun the wallet — the register is what refuses", () => {
    const shop = atStore(10);
    assert.ok(addToCart(shop.game, SAW));
    assert.strictEqual(cartOf(shop).length, 1);
    assert.strictEqual(shop.wallet.money, 10);
  });

  it("refuses a second broom — there is only ever one to a shop", () => {
    const shop = atStore(100);
    assert.ok(addToCart(shop.game, BROOM));
    assert.strictEqual(addToCart(shop.game, BROOM), false);
    assert.strictEqual(cartOf(shop).length, 1);
  });

  it("does nothing when the player isn't at a store", () => {
    const shop = new ShopDriver();
    assert.strictEqual(addToCart(shop.game, PINE), false);
    assert.strictEqual(currentCart(shop.game), null);
  });
});
