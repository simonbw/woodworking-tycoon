import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "./initialGameState";
import {
  isOutdoors,
  lotSize,
  TRUCK_BODY_WIDTH,
  TRUCK_LENGTH,
  truckParkedRect,
  wallSolids,
} from "./lot";
import { collisionWorld } from "./machine-collision";
import { PLAYER_RADIUS, stepPlayerMotion } from "./player-motion";
import { Vector } from "./Vectors";

/** Walk from `pos` holding `input` for `seconds`, in small steps —
 * the same repeated integration the render loop does. */
function walk(
  pos: Vector,
  input: Vector,
  seconds: number,
  world = collisionWorld(initialGameState),
): Vector {
  let next = pos;
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    next = stepPlayerMotion(next, input, 10, dt, world);
  }
  return next;
}

describe("lot geometry", () => {
  it("parks the truck centered on the door, backed to a 2-cell aisle", () => {
    const { min, max } = truckParkedRect(initialGameState.shopInfo);
    // Door center is the wall midline, x = 6, on the default 12-wide shop
    assert.strictEqual((min[0] + max[0]) / 2, 6);
    assert.ok(Math.abs(max[0] - min[0] - TRUCK_BODY_WIDTH) < 1e-9);
    assert.ok(Math.abs(max[1] - min[1] - TRUCK_LENGTH) < 1e-9);
    // Wall's outer face is y = 16.5; the tailgate sits 2 cells off it
    assert.strictEqual(min[1], 18.5);
  });

  it("sizes the lot to reach past the truck's nose", () => {
    const [w, h] = lotSize(initialGameState.shopInfo);
    assert.strictEqual(w, initialGameState.shopInfo.size[0]);
    assert.ok(h > truckParkedRect(initialGameState.shopInfo).max[1] + 2);
  });

  it("calls the door strip indoors and the driveway outdoors", () => {
    assert.strictEqual(isOutdoors(initialGameState.shopInfo, [6, 15]), false);
    assert.strictEqual(isOutdoors(initialGameState.shopInfo, [6, 16]), true);
    assert.strictEqual(isOutdoors(initialGameState.shopInfo, [2, 25]), true);
  });

  it("leaves exactly the door open in the bottom wall", () => {
    const solids = wallSolids(initialGameState.shopInfo);
    const bottom = solids.filter((s) => s.min[1] === 16);
    assert.strictEqual(bottom.length, 2);
    const [left, right] = [...bottom].sort((a, b) => a.min[0] - b.min[0]);
    // The gap is the 8-ft door, centered on the 12-ft wall
    assert.strictEqual(left.max[0], 2);
    assert.strictEqual(right.min[0], 10);
  });
});

describe("walking the lot", () => {
  it("walks out the garage door and stops at the tailgate", () => {
    const out = walk([6.5, 15], [0, 1], 1);
    assert.ok(out[1] > 17, "made it out past the wall");
    assert.ok(out[1] <= 18.5 - PLAYER_RADIUS + 1e-3, "tailgate stops the walk");
  });

  it("rounds the tailgate and walks the grass past the truck's nose", () => {
    // Down the right-side strip: the left one dead-ends at the for-sale
    // stand near the street.
    const atTailgate = walk([6.5, 15], [0, 1], 1);
    const besideTruck = walk(atTailgate, [1, 0], 1);
    assert.ok(besideTruck[0] > 8.75 + PLAYER_RADIUS, "cleared the body line");
    const belowTruck = walk(besideTruck, [0, 1], 2);
    const nose = truckParkedRect(initialGameState.shopInfo).max[1];
    assert.ok(belowTruck[1] > nose, "walked the strip past the nose");
  });

  it("is stopped by the wall everywhere but the door", () => {
    // An empty shop: the starter garbage can parks in the bottom-left
    // corner, and its collision circle would pinch a body probing the
    // short wall stub beside the 8-ft door.
    const world = collisionWorld({ ...initialGameState, machines: [] });
    const atLeftWall = walk([1, 15], [0, 1], 1, world);
    assert.ok(atLeftWall[1] <= 16 - PLAYER_RADIUS + 1e-3);
    const atRightWall = walk([11, 15], [0, 1], 1, world);
    assert.ok(atRightWall[1] <= 16 - PLAYER_RADIUS + 1e-3);
  });

  it("walks back in through the door from the driveway", () => {
    const inside = walk([6.5, 17.5], [0, -1], 1);
    assert.ok(inside[1] < 15, "back on the shop floor");
  });

  it("ends at the lot's bottom edge, not the world's", () => {
    // Down the right-side grass — the left strip dead-ends at the
    // for-sale stand now (see below).
    const world = collisionWorld(initialGameState);
    const stopped = walk([10.5, 30], [0, 1], 2);
    assert.ok(
      Math.abs(stopped[1] - (world.size[1] - PLAYER_RADIUS)) < 1e-3,
      "clamped at the lot bound",
    );
  });

  it("bounces off the for-sale stand in the left grass", () => {
    const world = collisionWorld(initialGameState);
    // Straight down the strip's middle, square into the table's face —
    // a walk that skims the table's corner slides around it instead.
    const stopped = walk([0.8, 30], [0, 1], 2);
    assert.ok(
      stopped[1] < world.size[1] - 2,
      "the table stopped the walk short of the lot's edge",
    );
  });

  it("frees the tailgate spot while the player is away", () => {
    const away = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        away: {
          kind: "shopping" as const,
          store: "orangeBox" as const,
          cart: [],
          hasCart: true,
          position: [0, 0] as [number, number],
          direction: 1 as const,
        },
      },
    };
    const down = walk([6.5, 15], [0, 1], 2, collisionWorld(away));
    assert.ok(down[1] > 20, "no truck in the driveway to stop at");
  });
});
