import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { getMaterialName, materialMeetsInput } from "./material-helpers";
import { panel, uniformPanel } from "./panel-helpers";

describe("materialMeetsInput", () => {
  it("matches on flat allowed-value fields", () => {
    const material = board("maple", 2, 2, 4);
    assert.ok(
      materialMeetsInput(material, { type: ["board"], species: ["maple"] }),
    );
    assert.ok(
      !materialMeetsInput(material, { type: ["board"], species: ["pine"] }),
    );
  });

  it("applies the matches predicate in addition to flat fields", () => {
    const material = board("maple", 2, 2, 4);
    assert.ok(
      materialMeetsInput(material, {
        type: ["board"],
        matches: (m) => m.type === "board" && m.width === 2,
      }),
    );
    assert.ok(
      !materialMeetsInput(material, {
        type: ["board"],
        matches: (m) => m.type === "board" && m.width === 6,
      }),
    );
  });

  it("rejects when flat fields fail even if the predicate passes", () => {
    const material = board("maple", 2, 2, 4);
    assert.ok(
      !materialMeetsInput(material, {
        type: ["board"],
        species: ["pine"],
        matches: () => true,
      }),
    );
  });
});

describe("getMaterialName", () => {
  it("names single-species panels by species and derived width", () => {
    assert.strictEqual(
      getMaterialName(uniformPanel("maple", 5, 2, 2, 4)),
      "Maple Panel (2'x10\"x4/4)",
    );
  });

  it("names multi-species panels as mixed wood", () => {
    const striped = panel(
      [
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
      ],
      2,
      4,
    );
    assert.strictEqual(
      getMaterialName(striped),
      "Mixed Wood Panel (2'x4\"x4/4)",
    );
  });
});
