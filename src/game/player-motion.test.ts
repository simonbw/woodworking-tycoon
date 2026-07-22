import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "./initialGameState";
import {
  BASE_WALK_SPEED,
  cellCenter,
  directionFromInput,
  motionCell,
  PLAYER_RADIUS,
  playerWalkSpeed,
  stepPlayerMotion,
} from "./player-motion";
import { Vector } from "./Vectors";

const openFloor = () => false;

/** A 3-wide corridor with a machine at [2, 1]. */
const machineAt =
  (...blocked: Vector[]) =>
  ([x, y]: Vector) =>
    blocked.some(([bx, by]) => bx === x && by === y);

describe("stepPlayerMotion", () => {
  it("moves in the input direction at speed * dt", () => {
    const next = stepPlayerMotion([0.5, 0.5], [1, 0], 2, 0.25, openFloor);
    assert.strictEqual(next[0], 1);
    assert.strictEqual(next[1], 0.5);
  });

  it("stands still with no input", () => {
    const next = stepPlayerMotion([0.5, 0.5], [0, 0], 2, 0.25, openFloor);
    assert.deepStrictEqual(next, [0.5, 0.5]);
  });

  it("normalizes diagonal input so it isn't faster", () => {
    const next = stepPlayerMotion([0.5, 0.5], [1, 1], 1, 1, openFloor);
    const traveled = Math.hypot(next[0] - 0.5, next[1] - 0.5);
    assert.ok(Math.abs(traveled - 1) < 1e-9);
  });

  it("stops at a blocked cell's edge", () => {
    const next = stepPlayerMotion([0.5, 0.5], [1, 0], 10, 1, machineAt([1, 0]));
    assert.ok(next[0] <= 1 - PLAYER_RADIUS);
    assert.ok(next[0] > 1 - PLAYER_RADIUS - 0.01);
  });

  it("stops at walls in the negative direction too", () => {
    const next = stepPlayerMotion(
      [0.5, 0.5],
      [-1, 0],
      10,
      1,
      machineAt([-1, 0]),
    );
    assert.ok(next[0] >= PLAYER_RADIUS);
    assert.ok(next[0] < PLAYER_RADIUS + 0.01);
  });

  it("slides along a wall on diagonal input", () => {
    // Wall of machines along y = -1; pushing up-right should still travel right
    const isBlocked = ([, y]: Vector) => y < 0;
    const next = stepPlayerMotion([0.5, 0.5], [1, -1], 2, 0.5, isBlocked);
    assert.ok(next[0] > 0.5, "should slide along the x axis");
    assert.ok(next[1] >= PLAYER_RADIUS, "should stay off the wall");
  });

  it("clips a shoulder poking into a blocked neighbor row", () => {
    // Standing low in row 1, the body overlaps row 2; a machine at [1, 2]
    // catches the shoulder even though the center row ahead is clear.
    const next = stepPlayerMotion([0.5, 1.8], [1, 0], 10, 1, machineAt([1, 2]));
    assert.ok(next[0] <= 1 - PLAYER_RADIUS, "corner clips the shoulder");
  });

  it("checks both rows the body overlaps, not just the center row", () => {
    // Standing near the top edge of row 1: the body pokes into row 0, so a
    // machine in row 0 ahead must still block.
    const next = stepPlayerMotion(
      [0.5, 1 + PLAYER_RADIUS / 2],
      [1, 0],
      10,
      1,
      machineAt([1, 0]),
    );
    assert.ok(next[0] <= 1 - PLAYER_RADIUS);
  });
});

describe("directionFromInput", () => {
  it("maps the dominant axis to a cardinal direction", () => {
    assert.strictEqual(directionFromInput([1, 0], 1), 0);
    assert.strictEqual(directionFromInput([-1, 0], 1), 2);
    assert.strictEqual(directionFromInput([0, -1], 0), 1);
    assert.strictEqual(directionFromInput([0, 1], 0), 3);
    assert.strictEqual(directionFromInput([0.9, -0.2], 3), 0);
  });

  it("keeps the previous facing on zero or perfectly diagonal input", () => {
    assert.strictEqual(directionFromInput([0, 0], 2), 2);
    assert.strictEqual(directionFromInput([1, 1], 2), 2);
  });
});

describe("playerWalkSpeed", () => {
  it("walks at full speed on a clean floor", () => {
    assert.strictEqual(playerWalkSpeed(initialGameState), BASE_WALK_SPEED);
  });

  it("slows to a wade in a deep drift", () => {
    // A full cell of dust is +3 tick-equivalents: quarter speed
    const state = { ...initialGameState, dust: { "0,0": { pine: 100 } } };
    assert.strictEqual(playerWalkSpeed(state), BASE_WALK_SPEED / 4);
  });
});

describe("motionCell / cellCenter", () => {
  it("round-trip: the center of a cell is in that cell", () => {
    assert.deepStrictEqual(motionCell(cellCenter([3, 7])), [3, 7]);
    assert.deepStrictEqual(motionCell([0.999, 2.001]), [0, 2]);
    assert.deepStrictEqual(motionCell([-0.2, 1.5]), [-1, 1]);
  });
});
