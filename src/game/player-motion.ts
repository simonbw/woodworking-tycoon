import { cellDust, dustSlowdown } from "./Dust";
import { GameState } from "./GameState";
import { MACHINE_TYPES } from "./Machine";
import { carryingShopVac, SHOP_VAC_DRAG_PENALTY } from "./ShopVac";
import { carryMoveBusyTicks } from "./game-actions/machine-actions";
import { Direction, Vector } from "./Vectors";

/**
 * Continuous player movement. The player's body lives off-grid — a point
 * with a radius, integrated every render frame — while GameState keeps
 * only the cell underfoot (see docs/continuous-movement.md). Everything
 * here is pure so it can be unit-tested without PIXI or React.
 */

/** Walking pace on a clean floor, in cells (feet) per second. */
export const BASE_WALK_SPEED = 9.3;

/**
 * Body radius in cells (feet) — just under 10 inches, so a 2-cell gap
 * between machines is a walkable aisle and a 1-cell gap is not. The body
 * spans several 1-ft cells; only the cell under its center is the "cell
 * underfoot" the simulation tracks.
 */
export const PLAYER_RADIUS = 0.8;

/** Keeps a resting body from sitting exactly on a solid's face. */
const EDGE_EPSILON = 1e-4;

/**
 * The player's walking speed right now, in cells per second. The old
 * grid walk charged extra ticks per step (deep sawdust, dragging the
 * vac, a machine over the shoulders); those same penalties now stretch
 * the time a stretch of floor takes to cross instead: each extra
 * tick-equivalent divides speed by one more.
 */
export function playerWalkSpeed(gameState: GameState): number {
  const carried = gameState.player.carriedMachine;
  const penalty =
    dustSlowdown(cellDust(gameState.dust, gameState.player.position)) +
    (carryingShopVac(gameState) ? SHOP_VAC_DRAG_PENALTY : 0) +
    (carried ? carryMoveBusyTicks(MACHINE_TYPES[carried.machineTypeId]) : 0);
  return BASE_WALK_SPEED / (1 + penalty);
}

/**
 * Quantize a movement input to the 4-way `Direction` the simulation
 * thinks in (sweep push, vac trailing, carried-machine placement). The
 * dominant axis wins; ties and zero input keep the previous facing.
 */
export function directionFromInput(
  [dx, dy]: Vector,
  fallback: Direction,
): Direction {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 0 : 2;
  }
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy > 0 ? 3 : 1;
  }
  return fallback;
}

/**
 * An axis-aligned solid the body cannot enter, in continuous cell
 * coordinates (cell [x, y] spans x..x+1). Machines contribute their
 * collision boxes (or their whole occupied tiles when they have none);
 * the shop walls are handled separately as the world bounds. See
 * machine-collision.ts.
 */
export interface SolidBox {
  readonly min: Vector;
  readonly max: Vector;
}

/** What the body collides with: the shop's floor rectangle and solids. */
export interface CollisionWorld {
  /** Shop size in cells; the walls are the rectangle's edges. */
  readonly size: Vector;
  readonly solids: ReadonlyArray<SolidBox>;
}

/**
 * Advance the player's continuous position by one frame: normalize the
 * input, integrate, and slide along anything solid.
 *
 * Collision is axis-separated body-vs-box: each axis moves on its own and
 * clamps the body's leading edge against any solid whose cross-axis span
 * it overlaps. Running diagonally into a machine therefore glides along
 * its face instead of sticking — most of what makes walking feel physical.
 * The clamp compares the start and end of the whole step, so a long step
 * (a dropped frame) stops at the face instead of tunneling through. A box
 * the body already overlaps (a fixture teleport, a machine set down over
 * the body's margin) never clamps — the body can always walk out, it just
 * can't press further in.
 */
export function stepPlayerMotion(
  pos: Vector,
  input: Vector,
  speed: number,
  dt: number,
  world: CollisionWorld,
  radius: number = PLAYER_RADIUS,
): Vector {
  let [dx, dy] = input;
  const length = Math.hypot(dx, dy);
  if (length === 0 || speed <= 0 || dt <= 0) {
    return pos;
  }
  if (length > 1) {
    dx /= length;
    dy /= length;
  }

  let [x, y] = pos;
  x = sweepAxis(x, y, dx * speed * dt, radius, world, 0);
  y = sweepAxis(y, x, dy * speed * dt, radius, world, 1);
  return [x, y];
}

/**
 * Move one coordinate by `step`, clamping the body's leading edge against
 * the walls and every solid it would press into. `axis` is the moving
 * axis (0 = x, 1 = y); `cross` is the body's current position on the
 * other axis.
 */
function sweepAxis(
  center: number,
  cross: number,
  step: number,
  radius: number,
  world: CollisionWorld,
  axis: 0 | 1,
): number {
  let next = center + step;

  // The walls: clamp to the floor rectangle. This also gently pulls in a
  // body teleported onto the margin (fixtures, loaded saves).
  const wallMax = world.size[axis] - radius;
  next = Math.min(Math.max(next, radius), wallMax);
  if (step === 0) {
    return next;
  }

  const crossAxis = (1 - axis) as 0 | 1;
  for (const solid of world.solids) {
    // Only solids whose cross-axis span the body actually overlaps can
    // block this axis — pressed flush alongside a box, the body must
    // still slide freely along its face.
    if (
      cross + radius - EDGE_EPSILON <= solid.min[crossAxis] ||
      cross - radius + EDGE_EPSILON >= solid.max[crossAxis]
    ) {
      continue;
    }
    if (step > 0) {
      // Clamp only when the step starts outside the box, so a body that
      // already overlaps one (teleport) can escape but never digs deeper.
      if (center + radius - EDGE_EPSILON <= solid.min[axis]) {
        next = Math.min(next, solid.min[axis] - radius - EDGE_EPSILON);
      }
    } else {
      if (center - radius + EDGE_EPSILON >= solid.max[axis]) {
        next = Math.max(next, solid.max[axis] + radius + EDGE_EPSILON);
      }
    }
  }
  return next;
}

/** The cell a continuous position stands in. */
export function motionCell([x, y]: Vector): Vector {
  return [Math.floor(x), Math.floor(y)];
}

/** The center of a cell, in continuous cell coordinates. */
export function cellCenter([x, y]: Vector): Vector {
  return [x + 0.5, y + 0.5];
}
