import assert from "node:assert";
import { describe, it } from "node:test";
import {
  addConsumables,
  hasConsumables,
  NO_CONSUMABLES,
  subtractConsumables,
} from "./Consumable";

describe("consumable stock helpers", () => {
  it("checks, adds, and subtracts amounts", () => {
    const stock = addConsumables(NO_CONSUMABLES, [{ id: "nails", amount: 10 }]);
    assert.strictEqual(stock.nails, 10);
    assert.ok(hasConsumables(stock, [{ id: "nails", amount: 10 }]));
    assert.ok(!hasConsumables(stock, [{ id: "nails", amount: 11 }]));
    assert.ok(!hasConsumables(stock, [{ id: "mineralOil", amount: 1 }]));
    const spent = subtractConsumables(stock, [{ id: "nails", amount: 4 }]);
    assert.strictEqual(spent.nails, 6);
  });
});
