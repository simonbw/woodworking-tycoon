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
  Solid,
  SolidBox,
  stepPlayerMotion,
} from "./player-motion";
import { Vector } from "./Vectors";
import { DUST_MAX_PER_CELL } from "./Dust";

/** A roomy floor so wall clamping never interferes unless a test wants it. */
const world = (
  solids: Solid[] = [],
  size: Vector = [100, 100],
): CollisionWorld => ({ size, solids });

/** An axis-aligned solid box. */
const box = (min: Vector, max: Vector): SolidBox => ({
  kind: "box",
  min,
  max,
});

/** A whole-tile solid at a cell (a wall, or a machine with no box). */
const tile = ([x, y]: Vector): SolidBox => box([x, y], [x + 1, y + 1]);

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
    const wall = box([0, 4], [100, 5]);
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

  it("keeps full tangential speed pressed diagonally into a face", () => {
    // Diagonal input into a long wall: the push-out removes only the
    // into-the-wall component, so the along-the-wall component survives
    // whole — no invisible friction.
    const wall = box([0, 6], [100, 7]);
    const start: Vector = [5.5, 6 - PLAYER_RADIUS - 1e-4];
    const next = stepPlayerMotion(start, [1, 1], 2, 1, world([wall]));
    const expected = 2 * Math.SQRT1_2; // tangential share of speed * dt
    assert.ok(Math.abs(next[0] - start[0] - expected) < 1e-6);
    assert.ok(next[1] <= 6 - PLAYER_RADIUS + 1e-3, "stays off the wall");
  });

  it("stops square against a face, but rounds an outside corner", () => {
    // Center-on: face contact stops the body dead. A quarter-radius
    // shoulder graze deflects around the corner and keeps going — the
    // difference between a doorway feeling snug and feeling sticky.
    const solid = tile([7, 6]);
    const headOn = stepPlayerMotion([5.5, 6.5], [1, 0], 10, 1, world([solid]));
    assert.ok(headOn[0] <= 7 - PLAYER_RADIUS + 1e-3, "face contact stops");

    const grazing = stepPlayerMotion(
      [5.5, 6 - (PLAYER_RADIUS * 3) / 4],
      [1, 0],
      10,
      1,
      world([solid]),
    );
    assert.ok(grazing[0] > 8, "a grazing shoulder rounds the corner");
    assert.ok(grazing[1] < 6 - (PLAYER_RADIUS * 3) / 4, "deflected outward");
  });

  it("walks up to a machine's box, past its tile edge", () => {
    // A box inset 0.2 into its tile: the body's leading edge rests at the
    // box face, not the tile boundary.
    const inset = box([7.2, 5.2], [7.8, 5.8]);
    const next = stepPlayerMotion([5.5, 5.5], [1, 0], 10, 1, world([inset]));
    assert.ok(next[0] <= 7.2 - PLAYER_RADIUS);
    assert.ok(next[0] > 7.2 - PLAYER_RADIUS - 0.01);
  });

  it("slides along a box's face while pressed against it", () => {
    const wall = box([7.2, 0], [7.8, 100]);
    const pressed: Vector = [7.2 - PLAYER_RADIUS - 1e-4, 5.5];
    const next = stepPlayerMotion(pressed, [0, 1], 2, 1, world([wall]));
    assert.strictEqual(next[0], pressed[0]);
    assert.ok(next[1] > 7, "should walk down freely along the face");
  });

  it("lets a shoulder pass a box held out of reach", () => {
    // The solid sits more than a body radius from the body's path, so
    // walking past must not catch on it.
    const clear = box([7, 5.5 + PLAYER_RADIUS + 0.05], [8, 7]);
    const next = stepPlayerMotion([5.5, 5.5], [1, 0], 10, 1, world([clear]));
    assert.ok(next[0] > 8, "shoulder passes the distant box");
  });

  it("stops at a solid disc and flows around an off-center one", () => {
    const can: Solid = { kind: "circle", center: [8, 5.5], radius: 0.9 };
    const headOn = stepPlayerMotion([5.5, 5.5], [1, 0], 10, 1, world([can]));
    assert.ok(
      headOn[0] <= 8 - 0.9 - PLAYER_RADIUS + 1e-3,
      "stops at the disc's edge",
    );

    // Aimed past the center: the radial push steers the body around.
    const offset = stepPlayerMotion([5.5, 6.2], [1, 0], 10, 1, world([can]));
    assert.ok(offset[0] > 9.5, "flows around the disc");
    for (const pos of [headOn, offset]) {
      assert.ok(
        Math.hypot(pos[0] - 8, pos[1] - 5.5) >= 0.9 + PLAYER_RADIUS - 1e-3,
        "never inside the disc",
      );
    }
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

  it("is pushed out of a solid it starts overlapping", () => {
    // A fixture teleport (or a machine set down over the body's margin)
    // can leave the body overlapping a solid; the first step pops it back
    // to the face — even pressing inward.
    const solid = tile([5, 5]);
    const start: Vector = [5.5 + PLAYER_RADIUS, 5.5];
    const out = stepPlayerMotion(start, [1, 0], 2, 1, world([solid]));
    assert.ok(out[0] >= 6 + PLAYER_RADIUS, "walking away pops free");
    const pressing = stepPlayerMotion(start, [-1, 0], 2, 0.01, world([solid]));
    assert.ok(
      pressing[0] >= 6 + PLAYER_RADIUS,
      "pressing inward still resolves to the face",
    );
  });

  it("exits a deep overlap through the nearest face", () => {
    // Center fully inside the solid: push out the short way.
    const solid = box([5, 5], [7, 6]);
    const next = stepPlayerMotion([5.2, 5.5], [0, 1], 2, 0.01, world([solid]));
    assert.ok(next[0] <= 5 - PLAYER_RADIUS, "left face is the short way out");
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
