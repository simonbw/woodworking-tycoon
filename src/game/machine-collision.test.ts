import assert from "node:assert";
import { describe, it } from "node:test";
import { CellInfo } from "./CellMap";
import { CollisionBox, Machine } from "./Machine";
import {
  cellObstruction,
  machineCellInsets,
  machineWorldBox,
  MAX_COLLISION_INSET,
} from "./machine-collision";
import { PLAYER_RADIUS, SOLID_CELL } from "./player-motion";
import { Direction, Vector } from "./Vectors";

/**
 * A stand-in for a placed machine: the collision helpers only read the
 * type's box and the placement's position/rotation.
 */
const placed = (
  collisionBox: CollisionBox | undefined,
  position: Vector = [0, 0],
  rotation: Direction = 0,
): Machine =>
  ({ type: { collisionBox }, position, rotation }) as unknown as Machine;

const cellInfoWith = (partial: Partial<CellInfo>): CellInfo =>
  partial as CellInfo;

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

describe("machineCellInsets", () => {
  it("reports how far the box sits in from each tile edge", () => {
    const insets = machineCellInsets(
      placed({ min: [-0.35, -0.35], max: [0.35, 0.35] }),
      [0, 0],
    );
    assertClose(insets, {
      left: 0.15,
      right: 0.15,
      top: 0.15,
      bottom: 0.15,
    });
  });

  it("caps insets below the player's radius", () => {
    // A tiny box may not open the cell so far that the player's center
    // could enter it.
    const insets = machineCellInsets(
      placed({ min: [-0.05, -0.05], max: [0.05, 0.05] }),
      [0, 0],
    );
    assertClose(insets, {
      left: MAX_COLLISION_INSET,
      right: MAX_COLLISION_INSET,
      top: MAX_COLLISION_INSET,
      bottom: MAX_COLLISION_INSET,
    });
    assert.ok(MAX_COLLISION_INSET < PLAYER_RADIUS);
  });

  it("floors insets at zero when the art overhangs the tile", () => {
    // The jointer's beds draw past its tile front and back.
    const insets = machineCellInsets(
      placed({ min: [-0.2, -0.65], max: [0.2, 0.65] }),
      [0, 0],
    );
    assertClose(insets, {
      left: MAX_COLLISION_INSET,
      right: MAX_COLLISION_INSET,
      top: 0,
      bottom: 0,
    });
  });

  it("only exposes a multi-cell box's outer faces", () => {
    // A 1×2 machine's box spanning both tiles: the shared interior edge
    // contributes no inset from either side.
    const machine = placed({ min: [-0.4, -0.4], max: [0.4, 1.4] });
    assertClose(machineCellInsets(machine, [0, 0]), {
      left: 0.1,
      right: 0.1,
      top: 0.1,
      bottom: 0,
    });
    assertClose(machineCellInsets(machine, [0, 1]), {
      left: 0.1,
      right: 0.1,
      top: 0,
      bottom: 0.1,
    });
  });
});

describe("cellObstruction", () => {
  const slimBox: CollisionBox = { min: [-0.3, -0.3], max: [0.3, 0.3] };

  it("treats off-floor as solid wall", () => {
    assert.deepStrictEqual(cellObstruction(undefined, [9, 9]), SOLID_CELL);
  });

  it("leaves open floor passable", () => {
    assert.strictEqual(
      cellObstruction(cellInfoWith({ machine: undefined }), [0, 0]),
      undefined,
    );
  });

  it("uses the machine's box insets", () => {
    const obstruction = cellObstruction(
      cellInfoWith({ machine: placed(slimBox) }),
      [0, 0],
    );
    assertClose(obstruction, {
      left: 0.2,
      right: 0.2,
      top: 0.2,
      bottom: 0.2,
    });
  });

  it("keeps the worktable solid under a mounted benchtop machine", () => {
    // The benchtop planer is slim, but the table it sits on fills the
    // tile — mounting it must not open the tile up.
    const obstruction = cellObstruction(
      cellInfoWith({
        machine: placed(slimBox),
        tableMachine: placed(undefined),
      }),
      [0, 0],
    );
    assertClose(obstruction, SOLID_CELL);
  });
});
