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
 * How far a blocked cell's solid area sits in from each tile edge, in
 * cells: `left`/`right` from the low-x/high-x edges, `top`/`bottom` from
 * the low-y/high-y edges (screen y grows downward). All zeros — the whole
 * tile is solid — is a wall or a machine with no collision box; a slim
 * machine reports positive insets so the body can walk up to what's
 * actually drawn. Insets are capped below PLAYER_RADIUS (see
 * MAX_COLLISION_INSET in machine-collision.ts) so the body's center can
 * never cross into a blocked cell.
 */
export type CellInsets = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** A cell whose whole tile blocks: walls, and machines without a box. */
export const SOLID_CELL: CellInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Advance the player's continuous position by one frame: normalize the
 * input, integrate, and slide along anything solid. `obstructionAt` gives
 * a cell's solid area as edge insets, or undefined for open floor (see
 * cellObstruction in machine-collision.ts).
 *
 * Collision is axis-separated circle-vs-box: each axis moves on its own
 * and clamps against the face of any solid area the body would overlap.
 * Running diagonally into a machine therefore glides along its face
 * instead of sticking — most of what makes walking feel physical.
 */
export function stepPlayerMotion(
  pos: Vector,
  input: Vector,
  speed: number,
  dt: number,
  obstructionAt: (cell: Vector) => CellInsets | undefined,
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
  // of tunneling through it. A lane only counts when the body actually
  // overlaps its solid span on the cross axis — pressed flush against a
  // slim machine, the body edge sits inside the machine's *tile* but not
  // its box, and must still slide freely along its face.
  x = sweepAxis(x, dx * speed * dt, radius, (lane, dir) => {
    let inset: number | undefined;
    for (const row of cellSpan(y, radius)) {
      const o = obstructionAt([lane, row]);
      if (o === undefined) continue;
      if (y + radius - EDGE_EPSILON <= row + o.top) continue;
      if (y - radius + EDGE_EPSILON >= row + 1 - o.bottom) continue;
      const face = dir > 0 ? o.left : o.right;
      inset = inset === undefined ? face : Math.min(inset, face);
    }
    return inset;
  });
  y = sweepAxis(y, dy * speed * dt, radius, (lane, dir) => {
    let inset: number | undefined;
    for (const col of cellSpan(x, radius)) {
      const o = obstructionAt([col, lane]);
      if (o === undefined) continue;
      if (x + radius - EDGE_EPSILON <= col + o.left) continue;
      if (x - radius + EDGE_EPSILON >= col + 1 - o.right) continue;
      const face = dir > 0 ? o.top : o.bottom;
      inset = inset === undefined ? face : Math.min(inset, face);
    }
    return inset;
  });

  return [x, y];
}

/**
 * Move one coordinate by `step`, stopping the body's leading edge at the
 * first blocked lane (column when sweeping x, row when sweeping y).
 * `laneInset` reports how far the approached face of a lane's solid area
 * sits in from the tile boundary — undefined when the lane is passable at
 * the body's current cross-axis position.
 */
function sweepAxis(
  center: number,
  step: number,
  radius: number,
  laneInset: (lane: number, dir: 1 | -1) => number | undefined,
): number {
  if (step === 0) {
    return center;
  }
  let next = center + step;
  if (step > 0) {
    const first = Math.floor(center + radius + EDGE_EPSILON);
    const last = Math.floor(next + radius);
    for (let lane = first; lane <= last; lane++) {
      const inset = laneInset(lane, 1);
      if (inset !== undefined) {
        return Math.min(next, lane + inset - radius - EDGE_EPSILON);
      }
    }
  } else {
    const first = Math.floor(center - radius - EDGE_EPSILON);
    const last = Math.floor(next - radius);
    for (let lane = first; lane >= last; lane--) {
      const inset = laneInset(lane, -1);
      if (inset !== undefined) {
        return Math.max(next, lane + 1 - inset + radius + EDGE_EPSILON);
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
