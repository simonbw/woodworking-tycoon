import assert from "node:assert";
import { describe, it } from "node:test";
import { panelSpecies, panelWidth } from "./Materials";
import { panel, uniformPanel } from "./panel-helpers";

describe("uniformPanel", () => {
  it("builds the requested number of identical strips", () => {
    const result = uniformPanel("maple", 5, 2, 2, 4);
    assert.strictEqual(result.strips.length, 5);
    assert.ok(
      result.strips.every(
        (strip) => strip.species === "maple" && strip.width === 2,
      ),
    );
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.thickness, 4);
  });
});

describe("panelWidth", () => {
  it("is the sum of strip widths", () => {
    assert.strictEqual(panelWidth(uniformPanel("maple", 5, 2, 2, 4)), 10);
  });

  it("handles mixed strip widths", () => {
    const mixed = panel(
      [
        { species: "walnut", width: 3 },
        { species: "maple", width: 1 },
        { species: "walnut", width: 2 },
      ],
      2,
      4,
    );
    assert.strictEqual(panelWidth(mixed), 6);
  });
});

describe("panelSpecies", () => {
  it("returns a single species once for uniform panels", () => {
    assert.deepStrictEqual(panelSpecies(uniformPanel("cherry", 4, 2, 2, 4)), [
      "cherry",
    ]);
  });

  it("returns distinct species in first-appearance order", () => {
    const striped = panel(
      [
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
      ],
      2,
      4,
    );
    assert.deepStrictEqual(panelSpecies(striped), ["walnut", "maple"]);
  });
});
