import assert from "node:assert";
import { describe, it } from "node:test";
import { CollisionBox, Machine, MACHINE_TYPES } from "./Machine";
import {
  machineSolids,
  machineWorldBox,
  shopSolids,
} from "./machine-collision";
import { PLAYER_RADIUS } from "./player-motion";
import { Direction, rotateVec, translateVec, Vector } from "./Vectors";

/**
 * A stand-in for a placed machine: the collision helpers only read the
 * type's box and footprint and the placement's position/rotation.
 */
const placed = (
  collisionBox: CollisionBox | undefined,
  position: Vector = [0, 0],
  rotation: Direction = 0,
  cellsOccupied: Vector[] = [[0, 0]],
): Machine =>
  ({
    type: { collisionBox, cellsOccupied },
    position,
    rotation,
    localToShop: (local: Vector) =>
      translateVec(rotateVec(local, rotation), position),
  }) as unknown as Machine;

const assertClose = (actual: unknown, expected: unknown): void => {
  assert.deepStrictEqual(
    JSON.parse(
      JSON.stringify(actual, (_, v) =>
        typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v,
      ),
    ),
    expected,
  );
};

describe("machineWorldBox", () => {
  it("is null for a machine without a box — its whole tiles block", () => {
    assert.strictEqual(machineWorldBox(placed(undefined)), null);
  });

  it("places an unrotated box around the origin cell's center", () => {
    const box = machineWorldBox(
      placed({ min: [-0.4, -0.3], max: [0.2, 0.1] }, [3, 5]),
    )!;
    assertClose(box.min, [3.1, 5.2]);
    assertClose(box.max, [3.7, 5.6]);
  });

  it("rotates the box with the machine", () => {
    // rotateVec sends [x, y] to [y, -x] at rotation 1, matching sprites
    // and cellsOccupied. An asymmetric box keeps the sides honest.
    const box = machineWorldBox(
      placed({ min: [-0.1, -0.4], max: [0.3, 0.2] }, [0, 0], 1),
    )!;
    assertClose(box.min, [0.1, 0.2]);
    assertClose(box.max, [0.7, 0.6]);
  });
});

describe("machineSolids", () => {
  it("uses the collision box when the machine has one", () => {
    const solids = machineSolids(
      placed({ min: [-0.4, -0.4], max: [1.4, 0.4] }, [2, 2]),
    );
    assert.strictEqual(solids.length, 1);
    assertClose(solids[0].min, [2.1, 2.1]);
    assertClose(solids[0].max, [3.9, 2.9]);
  });

  it("blocks each occupied tile of a boxless machine", () => {
    const solids = machineSolids(
      placed(undefined, [4, 4], 0, [
        [0, 0],
        [1, 0],
      ]),
    );
    assertClose(solids, [
      { min: [4, 4], max: [5, 5] },
      { min: [5, 4], max: [6, 5] },
    ]);
  });

  it("rotates a boxless footprint's tiles with the machine", () => {
    const solids = machineSolids(
      placed(undefined, [4, 4], 1, [
        [0, 0],
        [1, 0],
      ]),
    );
    // rotateVec sends [1, 0] to [0, -1] at rotation 1
    assertClose(solids, [
      { min: [4, 4], max: [5, 5] },
      { min: [4, 3], max: [5, 4] },
    ]);
  });

  it("combines every machine's solids for the shop", () => {
    const a = placed({ min: [-0.4, -0.4], max: [0.4, 0.4] }, [1, 1]);
    const b = placed(undefined, [5, 5]);
    assert.strictEqual(shopSolids([a, b]).length, 2);
  });
});

describe("real machine footprints", () => {
  it("every machine's collision box stays within its occupied tiles by less than the body radius", () => {
    // If a box hid deeper than PLAYER_RADIUS inside its footprint, the
    // body's center could wander onto an occupied cell and the
    // cell-underfoot bookkeeping would see the player standing "in" a
    // machine. Overhang past the footprint is fine (art pokes out).
    for (const type of Object.values(MACHINE_TYPES)) {
      if (!type.collisionBox) continue;
      const xs = type.cellsOccupied.map(([x]) => x);
      const ys = type.cellsOccupied.map(([, y]) => y);
      // Footprint bounds relative to the origin cell's center
      const bounds = {
        minX: Math.min(...xs) - 0.5,
        maxX: Math.max(...xs) + 0.5,
        minY: Math.min(...ys) - 0.5,
        maxY: Math.max(...ys) + 0.5,
      };
      const { min, max } = type.collisionBox;
      assert.ok(
        min[0] - bounds.minX < PLAYER_RADIUS,
        `${type.id}: box hides too deep on the left`,
      );
      assert.ok(
        bounds.maxX - max[0] < PLAYER_RADIUS,
        `${type.id}: box hides too deep on the right`,
      );
      assert.ok(
        min[1] - bounds.minY < PLAYER_RADIUS,
        `${type.id}: box hides too deep at the top`,
      );
      assert.ok(
        bounds.maxY - max[1] < PLAYER_RADIUS,
        `${type.id}: box hides too deep at the bottom`,
      );
    }
  });

  it("every machine with an operation position keeps it outside the footprint", () => {
    for (const type of Object.values(MACHINE_TYPES)) {
      if (!type.operationPosition) continue;
      assert.ok(
        !type.cellsOccupied.some(
          ([x, y]) =>
            x === type.operationPosition![0] &&
            y === type.operationPosition![1],
        ),
        `${type.id}: operation position sits on the machine itself`,
      );
    }
  });
});
