import assert from "node:assert";
import { describe, it } from "node:test";
import { DustMap } from "../game/Dust";
import { dustColorBySpecies } from "./colorBySpecies";
import {
  dominantSpeciesColor,
  dustLosses,
  gatherMoteCount,
  MAX_PARTICLES,
  PARTICLES_PER_UNIT,
  pourMoteCount,
} from "./dust-motes";

describe("dominantSpeciesColor", () => {
  it("is null for a clean cell", () => {
    assert.strictEqual(dominantSpeciesColor(undefined), null);
    assert.strictEqual(dominantSpeciesColor({}), null);
  });

  it("takes the color of the species with the most in the cell", () => {
    assert.strictEqual(
      dominantSpeciesColor({ pine: 0.2, walnut: 1.4 }),
      dustColorBySpecies.walnut.primary,
    );
  });

  it("colors sheet dust too", () => {
    assert.strictEqual(
      dominantSpeciesColor({ mdf: 3 }),
      dustColorBySpecies.mdf.primary,
    );
  });
});

describe("dustLosses", () => {
  it("reports a swept cell with the color it had while it was dirty", () => {
    const prev: DustMap = { "3,4": { oak: 2 } };
    const next: DustMap = { "3,4": { oak: 0.5 } };
    assert.deepStrictEqual(dustLosses(prev, next), [
      { cell: [3, 4], lost: 1.5, color: dustColorBySpecies.oak.primary },
    ]);
  });

  it("reports a cell swept clean out of the map entirely", () => {
    const losses = dustLosses({ "0,0": { pine: 1 } }, {});
    assert.strictEqual(losses.length, 1);
    assert.strictEqual(losses[0].lost, 1);
  });

  it("ignores cells that gained dust or held still", () => {
    const prev: DustMap = { "1,1": { maple: 1 }, "2,2": { maple: 1 } };
    const next: DustMap = { "1,1": { maple: 3 }, "2,2": { maple: 1 } };
    assert.deepStrictEqual(dustLosses(prev, next), []);
  });

  it("ignores rounding noise", () => {
    const prev: DustMap = { "1,1": { maple: 1 } };
    const next: DustMap = { "1,1": { maple: 1 - 1e-9 } };
    assert.deepStrictEqual(dustLosses(prev, next), []);
  });
});

describe("gatherMoteCount", () => {
  it("scales with the dust taken", () => {
    assert.strictEqual(gatherMoteCount(2, 0), 2 * PARTICLES_PER_UNIT);
  });

  it("throws at least one fleck for the smallest trickle", () => {
    assert.strictEqual(gatherMoteCount(0.001, 0), 1);
  });

  it("stops at the cap once the air is full", () => {
    assert.strictEqual(gatherMoteCount(100, MAX_PARTICLES - 3), 3);
    assert.ok(gatherMoteCount(100, MAX_PARTICLES) <= 0);
  });
});

describe("pourMoteCount", () => {
  it("is a thinner stream than a sweep's burst", () => {
    assert.ok(pourMoteCount(2, 0) < gatherMoteCount(2, 0));
  });

  it("keeps the stream visible on the smallest pour", () => {
    assert.strictEqual(pourMoteCount(0.01, 0), 2);
  });

  it("stops at the cap", () => {
    assert.strictEqual(pourMoteCount(100, MAX_PARTICLES - 5), 5);
  });
});
