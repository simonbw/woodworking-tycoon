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

/** Walking pace on a clean floor, in cells per second. */
export const BASE_WALK_SPEED = 3.5;

/** Body radius in cells — small enough to slip down one-cell aisles. */
export const PLAYER_RADIUS = 0.3;

/** Keeps a resting body from straddling a cell boundary exactly. */
const EDGE_EPSILON = 1e-4;

/**
 * The player's walking speed right now, in cells per second. The old
 * grid walk charged extra ticks per step (deep sawdust, dragging the
 * vac, a machine over the shoulders); those same penalties now stretch
 * the time a cell takes to cross instead: each extra tick-equivalent
 * divides speed by one more.
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
 * Advance the player's continuous position by one frame: normalize the
 * input, integrate, and slide along anything solid. `isBlocked` says
 * whether a cell is impassable (a machine, or off the floor entirely).
 *
 * Collision is axis-separated circle-vs-tile: each axis moves on its
 * own and clamps against the leading edge of any blocked cell the body
 * would overlap. Running diagonally into a machine therefore glides
 * along its face instead of sticking — most of what makes walking feel
 * physical.
 */
export function stepPlayerMotion(
  pos: Vector,
  input: Vector,
  speed: number,
  dt: number,
  isBlocked: (cell: Vector) => boolean,
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

  // Each axis sweeps every cell boundary the leading edge crosses, so a
  // long step (a dropped frame) clamps at the first solid cell instead
  // of tunneling through it.
  x = sweepAxis(x, dx * speed * dt, radius, (lane) =>
    cellSpan(y, radius).some((row) => isBlocked([lane, row])),
  );
  y = sweepAxis(y, dy * speed * dt, radius, (lane) =>
    cellSpan(x, radius).some((col) => isBlocked([col, lane])),
  );

  return [x, y];
}

/**
 * Move one coordinate by `step`, stopping the body's leading edge at the
 * first blocked lane (column when sweeping x, row when sweeping y).
 */
function sweepAxis(
  center: number,
  step: number,
  radius: number,
  laneBlocked: (lane: number) => boolean,
): number {
  if (step === 0) {
    return center;
  }
  let next = center + step;
  if (step > 0) {
    const first = Math.floor(center + radius + EDGE_EPSILON);
    const last = Math.floor(next + radius);
    for (let lane = first; lane <= last; lane++) {
      if (laneBlocked(lane)) {
        return Math.min(next, lane - radius - EDGE_EPSILON);
      }
    }
  } else {
    const first = Math.floor(center - radius - EDGE_EPSILON);
    const last = Math.floor(next - radius);
    for (let lane = first; lane >= last; lane--) {
      if (laneBlocked(lane)) {
        return Math.max(next, lane + 1 + radius + EDGE_EPSILON);
      }
    }
  }
  return next;
}

/** The cell indices a body at `center` with `radius` overlaps on one axis. */
function cellSpan(center: number, radius: number): number[] {
  const first = Math.floor(center - radius + EDGE_EPSILON);
  const last = Math.floor(center + radius - EDGE_EPSILON);
  const span = [];
  for (let i = first; i <= last; i++) {
    span.push(i);
  }
  return span;
}

/** The cell a continuous position stands in. */
export function motionCell([x, y]: Vector): Vector {
  return [Math.floor(x), Math.floor(y)];
}

/** The center of a cell, in continuous cell coordinates. */
export function cellCenter([x, y]: Vector): Vector {
  return [x + 0.5, y + 0.5];
}
