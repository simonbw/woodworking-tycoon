import assert from "node:assert";
import { describe, it } from "node:test";
import { SHEET_GOOD_KINDS } from "./Materials";
import { SHEET_SKUS, unlockedSheetSkus } from "./sheetStock";

describe("sheet rack", () => {
  it("sells every kind somewhere on the rack", () => {
    const stocked = new Set(SHEET_SKUS.map((sku) => sku.kind));
    for (const kind of SHEET_GOOD_KINDS) {
      assert.ok(stocked.has(kind), `no SKU sells ${kind}`);
    }
  });

  it("hides the cabinet shelf until reputation 12", () => {
    const starter = unlockedSheetSkus(0);
    assert.ok(starter.length > 0);
    assert.ok(!starter.some((sku) => sku.kind === "plywoodA"));
    assert.ok(!starter.some((sku) => sku.kind === "mdf"));
    assert.strictEqual(unlockedSheetSkus(12).length, SHEET_SKUS.length);
  });
});
