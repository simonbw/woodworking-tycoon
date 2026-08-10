import assert from "node:assert";
import { describe, it } from "node:test";
import { CollisionShape, Machine, MACHINE_TYPES } from "./Machine";
import {
  machineSolids,
  mergedTileBoxes,
  shopSolids,
} from "./machine-collision";
import { PLAYER_RADIUS } from "./player-motion";
import { Direction, rotateVec, translateVec, Vector } from "./Vectors";

/**
 * A stand-in for a placed machine: the collision helpers only read the
 * type's shapes and footprint and the placement's position/rotation.
 */
const placed = (
  collisionShapes: ReadonlyArray<CollisionShape> | undefined,
  position: Vector = [0, 0],
  rotation: Direction = 0,
  cellsOccupied: Vector[] = [[0, 0]],
): Machine =>
  ({
    type: { collisionShapes, cellsOccupied },
    position,
    rotation,
    localToShop: (local: Vector) =>
      translateVec(rotateVec(local, rotation), position),
  }) as unknown as Machine;

const box = (min: Vector, max: Vector): CollisionShape => ({
  kind: "box",
  min,
  max,
});

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

describe("machineSolids", () => {
  it("places an unrotated box around the origin cell's center", () => {
    const solids = machineSolids(
      placed([box([-0.4, -0.3], [0.2, 0.1])], [3, 5]),
    );
    assert.strictEqual(solids.length, 1);
    assertClose(solids[0], { kind: "box", min: [3.1, 5.2], max: [3.7, 5.6] });
  });

  it("rotates a box with the machine", () => {
    // rotateVec sends [x, y] to [y, -x] at rotation 1, matching sprites
    // and cellsOccupied. An asymmetric box keeps the sides honest.
    const solids = machineSolids(
      placed([box([-0.1, -0.4], [0.3, 0.2])], [0, 0], 1),
    );
    assertClose(solids[0], { kind: "box", min: [0.1, 0.2], max: [0.7, 0.6] });
  });

  it("carries every shape in the list, not just the first", () => {
    const solids = machineSolids(
      placed([box([-0.5, -0.5], [0.5, 0]), box([-0.2, 0], [0.2, 0.5])], [2, 2]),
    );
    assert.strictEqual(solids.length, 2);
    assertClose(solids[1], { kind: "box", min: [2.3, 2.5], max: [2.7, 3] });
  });

  it("rotates a circle's center and keeps its radius", () => {
    const solids = machineSolids(
      placed([{ kind: "circle", center: [0.5, 0.5], radius: 0.9 }], [4, 4], 1),
    );
    // rotateVec sends [0.5, 0.5] to [0.5, -0.5] at rotation 1
    assertClose(solids[0], { kind: "circle", center: [5, 4], radius: 0.9 });
  });

  it("blocks the merged tiles of a shapeless machine", () => {
    const solids = machineSolids(
      placed(undefined, [4, 4], 0, [
        [0, 0],
        [1, 0],
      ]),
    );
    assertClose(solids, [{ kind: "box", min: [4, 4], max: [6, 5] }]);
  });

  it("rotates a shapeless footprint's tiles with the machine", () => {
    const solids = machineSolids(
      placed(undefined, [4, 4], 1, [
        [0, 0],
        [1, 0],
      ]),
    );
    // rotateVec sends [1, 0] to [0, -1] at rotation 1
    assertClose(solids, [{ kind: "box", min: [4, 3], max: [5, 5] }]);
  });

  it("combines every machine's solids for the shop", () => {
    const a = placed([box([-0.4, -0.4], [0.4, 0.4])], [1, 1]);
    const b = placed(undefined, [5, 5]);
    assert.strictEqual(shopSolids([a, b]).length, 2);
  });
});

describe("mergedTileBoxes", () => {
  it("fuses a square footprint into one box", () => {
    const cells: Vector[] = [];
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) cells.push([x, y]);
    }
    assertClose(mergedTileBoxes(cells), [
      { kind: "box", min: [0, 0], max: [4, 4] },
    ]);
  });

  it("keeps an L-shape as two boxes", () => {
    const boxes = mergedTileBoxes([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    assertClose(boxes, [
      { kind: "box", min: [0, 0], max: [2, 1] },
      { kind: "box", min: [0, 1], max: [1, 2] },
    ]);
  });
});

describe("real machine footprints", () => {
  /** The union bounds of a type's collision shapes, in local cell units. */
  const shapeUnionBounds = (shapes: ReadonlyArray<CollisionShape>) => {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    for (const shape of shapes) {
      const [minX, minY, maxX, maxY] =
        shape.kind === "box"
          ? [shape.min[0], shape.min[1], shape.max[0], shape.max[1]]
          : [
              shape.center[0] - shape.radius,
              shape.center[1] - shape.radius,
              shape.center[0] + shape.radius,
              shape.center[1] + shape.radius,
            ];
      bounds.minX = Math.min(bounds.minX, minX);
      bounds.minY = Math.min(bounds.minY, minY);
      bounds.maxX = Math.max(bounds.maxX, maxX);
      bounds.maxY = Math.max(bounds.maxY, maxY);
    }
    return bounds;
  };

  it("every machine's shapes stay within its occupied tiles by less than the body radius", () => {
    // If the union hid deeper than PLAYER_RADIUS inside its footprint,
    // the body's center could wander onto an occupied cell and the
    // cell-underfoot bookkeeping would see the player standing "in" a
    // machine. Overhang past the footprint is fine (art pokes out).
    for (const type of Object.values(MACHINE_TYPES)) {
      if (!type.collisionShapes) continue;
      const xs = type.cellsOccupied.map(([x]) => x);
      const ys = type.cellsOccupied.map(([, y]) => y);
      // Footprint bounds relative to the origin cell's center
      const footprint = {
        minX: Math.min(...xs) - 0.5,
        maxX: Math.max(...xs) + 0.5,
        minY: Math.min(...ys) - 0.5,
        maxY: Math.max(...ys) + 0.5,
      };
      const union = shapeUnionBounds(type.collisionShapes);
      assert.ok(
        union.minX - footprint.minX < PLAYER_RADIUS,
        `${type.id}: shapes hide too deep on the left`,
      );
      assert.ok(
        footprint.maxX - union.maxX < PLAYER_RADIUS,
        `${type.id}: shapes hide too deep on the right`,
      );
      assert.ok(
        union.minY - footprint.minY < PLAYER_RADIUS,
        `${type.id}: shapes hide too deep at the top`,
      );
      assert.ok(
        footprint.maxY - union.maxY < PLAYER_RADIUS,
        `${type.id}: shapes hide too deep at the bottom`,
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
