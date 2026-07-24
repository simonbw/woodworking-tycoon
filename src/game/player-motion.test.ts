import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "./initialGameState";
import {
  BASE_WALK_SPEED,
  cellCenter,
  CollisionWorld,
  directionFromInput,
  motionCell,
  PLAYER_RADIUS,
  playerWalkSpeed,
  SolidBox,
  stepPlayerMotion,
} from "./player-motion";
import { Vector } from "./Vectors";
import { DUST_MAX_PER_CELL } from "./Dust";

/** A roomy floor so wall clamping never interferes unless a test wants it. */
const world = (
  solids: SolidBox[] = [],
  size: Vector = [100, 100],
): CollisionWorld => ({ size, solids });

/** A whole-tile solid at a cell (a wall, or a machine with no box). */
const tile = ([x, y]: Vector): SolidBox => ({
  min: [x, y],
  max: [x + 1, y + 1],
});

describe("stepPlayerMotion", () => {
  it("moves in the input direction at speed * dt", () => {
    const next = stepPlayerMotion([5.5, 5.5], [1, 0], 2, 0.25, world());
    assert.strictEqual(next[0], 6);
    assert.strictEqual(next[1], 5.5);
  });

  it("stands still with no input", () => {
    const next = stepPlayerMotion([5.5, 5.5], [0, 0], 2, 0.25, world());
    assert.deepStrictEqual(next, [5.5, 5.5]);
  });

  it("normalizes diagonal input so it isn't faster", () => {
    const next = stepPlayerMotion([5.5, 5.5], [1, 1], 1, 1, world());
    const traveled = Math.hypot(next[0] - 5.5, next[1] - 5.5);
    assert.ok(Math.abs(traveled - 1) < 1e-9);
  });

  it("stops at a solid tile's face", () => {
    const next = stepPlayerMotion(
      [5.5, 5.5],
      [1, 0],
      10,
      1,
      world([tile([7, 5])]),
    );
    assert.ok(next[0] <= 7 - PLAYER_RADIUS);
    assert.ok(next[0] > 7 - PLAYER_RADIUS - 0.01);
  });

  it("stops at a solid approaching from the right too", () => {
    const next = stepPlayerMotion(
      [5.5, 5.5],
      [-1, 0],
      10,
      1,
      world([tile([3, 5])]),
    );
    assert.ok(next[0] >= 4 + PLAYER_RADIUS);
    assert.ok(next[0] < 4 + PLAYER_RADIUS + 0.01);
  });

  it("stops at the shop walls", () => {
    const next = stepPlayerMotion([1, 1], [-1, -1], 10, 1, world([], [12, 16]));
    assert.deepStrictEqual(next, [PLAYER_RADIUS, PLAYER_RADIUS]);
  });

  it("slides along a wall of solids on diagonal input", () => {
    // Solids along the row above; pushing up-right should still travel right
    const wall = { min: [0, 4] as Vector, max: [100, 5] as Vector };
    const next = stepPlayerMotion(
      [5.5, 5 + PLAYER_RADIUS],
      [1, -1],
      2,
      0.5,
      world([wall]),
    );
    assert.ok(next[0] > 5.5, "should slide along the x axis");
    assert.ok(next[1] >= 5 + PLAYER_RADIUS - 1e-3, "should stay off the wall");
  });

  it("clips a shoulder poking into a solid in a neighboring row", () => {
    // The body is wider than a cell: standing with its center in one row,
    // its shoulder overlaps the next row, so a solid there still blocks.
    const next = stepPlayerMotion(
      [5.5, 5.5 + PLAYER_RADIUS / 2],
      [1, 0],
      10,
      1,
      world([tile([7, 6])]),
    );
    assert.ok(next[0] <= 7 - PLAYER_RADIUS, "corner clips the shoulder");
  });

  it("walks up to a machine's box, past its tile edge", () => {
    // A box inset 0.2 into its tile: the body's leading edge rests at the
    // box face, not the tile boundary.
    const box: SolidBox = { min: [7.2, 5.2], max: [7.8, 5.8] };
    const next = stepPlayerMotion([5.5, 5.5], [1, 0], 10, 1, world([box]));
    assert.ok(next[0] <= 7.2 - PLAYER_RADIUS);
    assert.ok(next[0] > 7.2 - PLAYER_RADIUS - 0.01);
  });

  it("slides along a box's face while pressed against it", () => {
    const box: SolidBox = { min: [7.2, 0], max: [7.8, 100] };
    const pressed: Vector = [7.2 - PLAYER_RADIUS - 1e-4, 5.5];
    const next = stepPlayerMotion(pressed, [0, 1], 2, 1, world([box]));
    assert.strictEqual(next[0], pressed[0]);
    assert.ok(next[1] > 7, "should walk down freely along the face");
  });

  it("lets a shoulder pass a box held out of reach", () => {
    // The solid sits more than a body radius from the body's path, so
    // walking past must not catch on it.
    const box: SolidBox = {
      min: [7, 5.5 + PLAYER_RADIUS + 0.05],
      max: [8, 7],
    };
    const next = stepPlayerMotion([5.5, 5.5], [1, 0], 10, 1, world([box]));
    assert.ok(next[0] > 8, "shoulder passes the distant box");
  });

  it("does not tunnel through a solid on a long step", () => {
    const next = stepPlayerMotion(
      [5.5, 5.5],
      [1, 0],
      1000,
      1,
      world([tile([7, 5])]),
    );
    assert.ok(next[0] <= 7 - PLAYER_RADIUS, "a dropped frame still stops");
  });

  it("can walk out of a box it starts inside, but not deeper in", () => {
    // A fixture teleport can drop the body's margin over a solid; the
    // sweep must allow escape and refuse to dig further.
    const box: SolidBox = { min: [5, 5], max: [6, 6] };
    const start: Vector = [5.5 + PLAYER_RADIUS, 5.5];
    const out = stepPlayerMotion(start, [1, 0], 2, 1, world([box]));
    assert.ok(out[0] > start[0], "walking away from the overlap works");
    const deeper = stepPlayerMotion(start, [-1, 0], 2, 1, world([box]));
    assert.ok(deeper[0] <= start[0], "cannot press further into the solid");
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
    // A full cell of dust underfoot is +3 tick-equivalents: quarter speed
    const underfoot = initialGameState.player.position.join(",");
    const state = {
      ...initialGameState,
      dust: { [underfoot]: { pine: DUST_MAX_PER_CELL } },
    };
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
