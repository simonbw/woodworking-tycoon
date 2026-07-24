import assert from "node:assert";
import { describe, it } from "node:test";
import {
  cellDust,
  depositDust,
  DUST_MAX_PER_CELL,
  dustKey,
  dustKeyToVec,
  dustSlowdown,
  dustTotal,
  emitMachineDust,
  machineDustCells,
  machineDustMultiplier,
} from "./Dust";
import { Machine } from "./Machine";
import { rotateVec, translateVec, Vector } from "./Vectors";

const SHOP: Vector = [4, 6];

/**
 * A synthetic single-cell machine with its operator cell in front — the
 * dust helpers only read the footprint, rotation, and operation position,
 * so a fake keeps these tests independent of any real machine's footprint.
 */
function planerAt(position: Vector, rotation: 0 | 1 | 2 | 3 = 0): Machine {
  const operationPosition: Vector = [0, 1];
  return {
    type: { cellsOccupied: [[0, 0]], operationPosition },
    position,
    rotation,
    localToShop: (local: Vector) =>
      translateVec(rotateVec(local, rotation), position),
    get absoluteOperationPosition(): Vector {
      return translateVec(rotateVec(operationPosition, rotation), position);
    },
  } as unknown as Machine;
}

describe("dust keys", () => {
  it("round-trips positions through keys", () => {
    assert.deepStrictEqual(dustKeyToVec(dustKey([3, 5])), [3, 5]);
  });
});

describe("dustTotal", () => {
  it("treats a missing record as clean", () => {
    assert.strictEqual(dustTotal(undefined), 0);
  });

  it("sums across species", () => {
    assert.strictEqual(dustTotal({ walnut: 2, pine: 3.5 }), 5.5);
  });
});

describe("depositDust", () => {
  it("merges into existing species amounts without mutating the original", () => {
    const before = { "1,1": { walnut: 1 } };
    const after = depositDust(
      before,
      [{ position: [1, 1], species: "walnut", amount: 2 }],
      SHOP,
    );
    assert.strictEqual(after["1,1"].walnut, 3);
    assert.strictEqual(before["1,1"].walnut, 1);
  });

  it("keeps species separate in the same cell", () => {
    const after = depositDust(
      { "1,1": { walnut: 1 } },
      [{ position: [1, 1], species: "pine", amount: 2 }],
      SHOP,
    );
    assert.deepStrictEqual(after["1,1"], { walnut: 1, pine: 2 });
  });

  it("drops deposits aimed outside the shop", () => {
    const after = depositDust(
      {},
      [{ position: [-1, 0], species: "pine", amount: 5 }],
      SHOP,
    );
    assert.deepStrictEqual(after, {});
  });

  it("spills overflow to the least-dusty orthogonal neighbor", () => {
    const nearlyFull = DUST_MAX_PER_CELL - 1;
    const after = depositDust(
      { "1,1": { pine: nearlyFull }, "0,1": { oak: 5 } },
      [{ position: [1, 1], species: "pine", amount: 4 }],
      SHOP,
    );
    // Cell clamps at max; the extra 3 lands on a clean neighbor, not the
    // one already holding 5 oak.
    assert.strictEqual(cellDust(after, [1, 1]), DUST_MAX_PER_CELL);
    assert.strictEqual(cellDust(after, [0, 1]), 5);
    const spilled = (["2,1", "1,0", "1,2"] as const).map(
      (key) => after[key]?.pine ?? 0,
    );
    assert.strictEqual(
      spilled.reduce((a, b) => a + b, 0),
      3,
    );
  });
});

describe("machineDustCells", () => {
  it("cores the occupied cell and operation position, rings their neighbors", () => {
    const { core, ring } = machineDustCells(planerAt([1, 1]));
    // Planer occupies [1,1]; operation position [0,1] local → [1,2] shop
    assert.deepStrictEqual(core, [
      [1, 1],
      [1, 2],
    ]);
    const ringKeys = ring.map(dustKey).sort();
    assert.deepStrictEqual(
      ringKeys,
      ["0,1", "0,2", "1,0", "1,3", "2,1", "2,2"].sort(),
    );
  });

  it("rotates with the machine", () => {
    // Rotation 1 maps local [0,1] to shop offset [1,0]
    const { core } = machineDustCells(planerAt([1, 1], 1));
    assert.deepStrictEqual(core, [
      [1, 1],
      [2, 1],
    ]);
  });
});

describe("emitMachineDust", () => {
  it("lands the bulk on the core cells and the rest on the ring", () => {
    const after = emitMachineDust({}, planerAt([1, 1]), ["walnut"], 1, SHOP);
    // 70% split across 2 core cells, 30% across 6 ring cells
    assert.ok(Math.abs(cellDust(after, [1, 1]) - 0.35) < 1e-9);
    assert.ok(Math.abs(cellDust(after, [1, 2]) - 0.35) < 1e-9);
    assert.ok(Math.abs(cellDust(after, [2, 1]) - 0.05) < 1e-9);
    const total = Object.values(after).reduce(
      (sum, amounts) => sum + dustTotal(amounts),
      0,
    );
    assert.ok(Math.abs(total - 1) < 1e-9);
  });

  it("splits the amount across the species being cut", () => {
    const after = emitMachineDust(
      {},
      planerAt([1, 1]),
      ["walnut", "maple"],
      1,
      SHOP,
    );
    assert.ok(Math.abs((after["1,1"].walnut ?? 0) - 0.175) < 1e-9);
    assert.ok(Math.abs((after["1,1"].maple ?? 0) - 0.175) < 1e-9);
  });

  it("returns the same reference when there is nothing to emit", () => {
    const dust = { "1,1": { pine: 1 } };
    assert.strictEqual(
      emitMachineDust(dust, planerAt([1, 1]), [], 1, SHOP),
      dust,
    );
    assert.strictEqual(
      emitMachineDust(dust, planerAt([1, 1]), ["pine"], 0, SHOP),
      dust,
    );
  });
});

describe("dustSlowdown", () => {
  it("costs nothing through the dead zone", () => {
    assert.strictEqual(dustSlowdown(0), 0);
    assert.strictEqual(dustSlowdown(DUST_MAX_PER_CELL * 0.3), 0);
  });

  it("ramps linearly to +300% at a full cell", () => {
    assert.strictEqual(dustSlowdown(DUST_MAX_PER_CELL), 3);
    // Midway through the ramp (65% of cap): half the max slowdown
    assert.ok(Math.abs(dustSlowdown(DUST_MAX_PER_CELL * 0.65) - 1.5) < 1e-9);
    // Overfull (spilled cells) still caps at 3
    assert.strictEqual(dustSlowdown(DUST_MAX_PER_CELL * 2), 3);
  });
});

describe("machineDustMultiplier", () => {
  it("is 1 on a clean floor", () => {
    assert.strictEqual(machineDustMultiplier({}, planerAt([1, 1]), SHOP), 1);
  });

  it("averages the core and ring cells", () => {
    // All 8 cells (2 core + 6 ring) buried: full +300%
    const buried = Object.fromEntries(
      [
        [1, 1],
        [1, 2],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 3],
        [2, 1],
        [2, 2],
      ].map((cell) => [
        dustKey(cell as [number, number]),
        { pine: DUST_MAX_PER_CELL },
      ]),
    );
    assert.strictEqual(
      machineDustMultiplier(buried, planerAt([1, 1]), SHOP),
      4,
    );
    // One buried cell out of eight averages inside the dead zone
    assert.strictEqual(
      machineDustMultiplier(
        { "1,1": { pine: DUST_MAX_PER_CELL } },
        planerAt([1, 1]),
        SHOP,
      ),
      1,
    );
  });
});
