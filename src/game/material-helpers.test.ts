import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import {
  describeMaterialRequirement,
  describeStockDimensionsPlain,
  getMaterialFullName,
  getMaterialName,
  getMaterialState,
  makeMaterial,
  materialMeetsInput,
} from "./material-helpers";
import { FinishedProduct, REAL_WOOD_SPECIES, SheetGood } from "./Materials";
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
      "Board (Pallet, any surface, 1/4×4\"×2')",
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
      "Board (Pallet, Sanded, 1/4×4\"×3')",
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
      "Board (any species, Smooth or Sanded, thickness 4/4, any width, length 2')",
    );
  });

  it("lists every accepted species with a trailing 'or'", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["simpleCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        quantity: 2,
      }),
      "Simple cutting board (Pine, Poplar, Oak, Maple, Cherry, Walnut, Mahogany, or Purple heart)",
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

  it("phrases milling constraints as shop language, silent when absent", () => {
    // The planer's threshold: any flat reference face will do
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["board"],
        jointedFaces: [1, 2],
        quantity: 1,
      }),
      "Board (any species, any surface, a flat face, any thickness, any width, any length)",
    );
    // The glue-up's completion: both edges ripped parallel
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["board"],
        length: [2],
        width: [2],
        thickness: [4],
        surface: ["smooth", "sanded"],
        jointedEdges: [2],
        quantity: 5,
      }),
      "Board (any species, Smooth or Sanded, edges ripped parallel, 4/4×2\"×2')",
    );
    // The jointer wants untouched stock — and unconstrained axes say nothing
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["board"],
        jointedFaces: [0],
        quantity: 1,
      }),
      "Board (any species, any surface, faces not yet jointed, any thickness, any width, any length)",
    );
  });
});

describe("getMaterialName", () => {
  it("gives construction pine the nominal callout, length last", () => {
    assert.strictEqual(
      getMaterialName(board("pine", 8, 4, 8, "smooth")),
      "Pine 2x4 — 8'",
    );
    assert.strictEqual(
      getMaterialName(board("pine", 8, 4, 4, "smooth")),
      "Pine 1x4 — 8'",
    );
    // Crosscuts keep the callout: a 4' 2x4 is still a 2x4
    assert.strictEqual(
      getMaterialName(board("pine", 4, 4, 8, "smooth")),
      "Pine 2x4 — 4'",
    );
  });

  it("drops the callout when the board leaves a nominal size", () => {
    // Planed to 6/4: no longer a true 2" — quarters take over
    assert.strictEqual(
      getMaterialName(board("pine", 8, 4, 6, "smooth")),
      "Pine 6/4 — 4\" × 8'",
    );
    // Ripped to a 1" strip
    assert.strictEqual(
      getMaterialName(board("pine", 8, 1, 8, "smooth")),
      "Pine 8/4 — 1\" × 8'",
    );
  });

  it("names hardwood in quarters, cut-list order", () => {
    assert.strictEqual(
      getMaterialName(board("walnut", 8, 6, 8, "rough")),
      "Walnut 8/4 — 6\" × 8'",
    );
    // Hardwood is never nominal, even on a nominal size
    assert.strictEqual(
      getMaterialName(board("oak", 8, 4, 8, "smooth")),
      "Oak 8/4 — 4\" × 8'",
    );
  });

  it("names pallet stock as pallet wood", () => {
    assert.strictEqual(
      getMaterialName(board("pallet", 3, 4, 1)),
      "Pallet Wood 1/4 — 4\" × 3'",
    );
  });

  it("names single-species panels by species and size", () => {
    assert.strictEqual(
      getMaterialName(uniformPanel("maple", 5, 2, 2, 4)),
      "Maple Panel 4/4 — 10\" × 2'",
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
      "Mixed Wood Panel 4/4 — 4\" × 2'",
    );
  });
});

describe("getMaterialState", () => {
  it("carries surface and milling, without the rough-sawn stutter", () => {
    assert.strictEqual(
      getMaterialState(
        board("walnut", 8, 6, 4, "rough", { faces: 0, edges: 0 }),
      ),
      "rough sawn",
    );
    assert.strictEqual(
      getMaterialState(board("maple", 2, 2, 4, "sanded")),
      "sanded, S4S",
    );
    assert.strictEqual(
      getMaterialState(uniformPanel("maple", 5, 2, 2, 4)),
      "rough",
    );
  });

  it("stays null for materials whose state never varies", () => {
    assert.strictEqual(
      getMaterialState(
        makeMaterial<FinishedProduct>({
          type: "simpleCuttingBoard",
          species: "maple",
        }),
      ),
      null,
    );
  });
});

describe("getMaterialFullName", () => {
  it("joins name and state for grouping keys", () => {
    assert.strictEqual(
      getMaterialFullName(board("pine", 8, 4, 8, "smooth")),
      "Pine 2x4 — 8' (smooth, S4S)",
    );
  });
});

describe("describeStockDimensionsPlain", () => {
  it("translates quarters into fractional inches", () => {
    assert.strictEqual(
      describeStockDimensionsPlain(board("walnut", 8, 6, 8)),
      '2" thick · 6" wide · 8\' long',
    );
    assert.strictEqual(
      describeStockDimensionsPlain(board("walnut", 8, 6, 6)),
      '1-1/2" thick · 6" wide · 8\' long',
    );
    assert.strictEqual(
      describeStockDimensionsPlain(board("pallet", 3, 4, 1)),
      '1/4" thick · 4" wide · 3\' long',
    );
  });

  it("has nothing to say about finished products", () => {
    assert.strictEqual(
      describeStockDimensionsPlain(
        makeMaterial<FinishedProduct>({
          type: "simpleCuttingBoard",
          species: "maple",
        }),
      ),
      null,
    );
  });
});

describe("sheet good naming", () => {
  const sheet = (
    kind: SheetGood["kind"],
    length: SheetGood["length"],
    width: SheetGood["width"],
    thickness: SheetGood["thickness"],
  ) =>
    makeMaterial<SheetGood>({
      type: "plywood",
      kind,
      length,
      width,
      thickness,
    });

  it("names sheets by kind in sheet grammar — feet both ways", () => {
    assert.strictEqual(
      getMaterialName(sheet("plywoodB", 4, 4, 2)),
      "Shop Plywood 2/4 — 4' × 4'",
    );
    assert.strictEqual(
      getMaterialName(sheet("plywoodA", 8, 4, 3)),
      "Cabinet Plywood 3/4 — 4' × 8'",
    );
    assert.strictEqual(
      getMaterialName(sheet("mdf", 4, 4, 3)),
      "MDF 3/4 — 4' × 4'",
    );
  });

  it("spells sheet dimensions in plain feet and inches", () => {
    assert.strictEqual(
      describeStockDimensionsPlain(sheet("osb", 4, 4, 2)),
      "1/2\" thick · 4' wide · 4' long",
    );
  });
});

describe("describeMaterialRequirement for sheets", () => {
  it("names kinds by their store signs and widths in feet", () => {
    assert.strictEqual(
      describeMaterialRequirement({
        type: ["plywood"],
        kind: ["plywoodB", "mdf"],
        length: [4],
        width: [4],
        quantity: 1,
      }),
      "Plywood (Shop Plywood or MDF, any thickness, width 4', length 4')",
    );
  });
});
