import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import {
  describeMaterialRequirement,
  getMaterialName,
  materialMeetsInput,
} from "./material-helpers";
import { REAL_WOOD_SPECIES } from "./Materials";
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

describe("describeMaterialRequirement", () => {
  it("spells out species and compact dimensions for a fully-specified board", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["board"],
        species: ["pallet"],
        length: [2],
        width: [4],
        thickness: [1],
        quantity: 4,
      }),
      "Board (Pallet, any surface, 2'×4\"×1/4)",
    );
  });

  it("shows a specified surface instead of 'any surface'", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["board"],
        species: ["pallet"],
        length: [3],
        width: [4],
        thickness: [1],
        surface: ["sanded"],
        quantity: 4,
      }),
      "Board (Pallet, Sanded, 3'×4\"×1/4)",
    );
  });

  it("reads unconstrained attributes as 'any' and lists multi-value choices", () => {
    // glueUpPair: any species, any width, smooth or sanded
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["board"],
        length: [2],
        thickness: [4],
        surface: ["smooth", "sanded"],
        quantity: 2,
      }),
      "Board (any species, Smooth or Sanded, length 2', any width, thickness 4/4)",
    );
  });

  it("lists every accepted species with a trailing 'or'", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["simpleCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        quantity: 2,
      }),
      "Simple cutting board (Pine, Oak, Maple, Cherry, Walnut, Mahogany, or Purple heart)",
    );
  });

  it("describes finished products by species only", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["rusticShelf"],
        species: ["pallet"],
        quantity: 1,
      }),
      "Rustic shelf (Pallet)",
    );
  });

  it("joins multiple accepted types without inventing constraints", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["simpleCuttingBoard", "stripedCuttingBoard"],
        quantity: 1,
        matches: () => true,
      }),
      "Simple cutting board or Striped cutting board",
    );
  });

  it("names a bare type with no constraints", () => {
    assert.strictEqual(
      describeMaterialRequirement({ type: ["pallet"], quantity: 1 }),
      "Pallet",
    );
  });
});

describe("getMaterialName", () => {
  it("names single-species panels by species, width, and surface", () => {
    assert.strictEqual(
      getMaterialName(uniformPanel("maple", 5, 2, 2, 4)),
      "Maple Panel (2'x10\"x4/4, rough)",
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
      "smooth",
    );
    assert.strictEqual(
      getMaterialName(striped),
      "Mixed Wood Panel (2'x4\"x4/4, smooth)",
    );
  });
});
