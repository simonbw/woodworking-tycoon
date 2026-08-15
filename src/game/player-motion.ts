import { cellDust, dustSlowdown } from "./Dust";
import { GameState } from "./GameState";
import { holdingBroom } from "./HeldTool";
import { carryingShopVac, SHOP_VAC_DRAG_PENALTY } from "./ShopVac";
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
 * vac); those same penalties now stretch the time a stretch of floor
 * takes to cross instead: each extra tick-equivalent divides speed by
 * one more. Carrying a machine costs nothing — you walk at your normal
 * pace with a bench over your shoulders.
 */
/** Actively plowing dust has heft — you walk, but not at full stride. */
export const SWEEPING_PENALTY = 0.6;

export function playerWalkSpeed(gameState: GameState): number {
  const sweeping =
    holdingBroom(gameState) && gameState.player.operating === true;
  const penalty =
    dustSlowdown(cellDust(gameState.dust, gameState.player.position)) +
    (carryingShopVac(gameState) ? SHOP_VAC_DRAG_PENALTY : 0) +
    (sweeping ? SWEEPING_PENALTY : 0);
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
 * An axis-aligned solid box the body cannot enter, in continuous cell
 * coordinates (cell [x, y] spans x..x+1). The building's walls are
 * boxes too (see lot.ts); only the lot's outer edges are the world
 * bounds. See machine-collision.ts.
 */
export interface SolidBox {
  readonly kind: "box";
  readonly min: Vector;
  readonly max: Vector;
}

/** A solid disc — a garbage can, anything round. Same coordinates. */
export interface SolidCircle {
  readonly kind: "circle";
  readonly center: Vector;
  readonly radius: number;
}

/**
 * Something the body cannot enter. Machines contribute their collision
 * shapes (or their whole occupied tiles when they have none); see
 * machine-collision.ts.
 */
export type Solid = SolidBox | SolidCircle;

/** What the body collides with: the walkable world's rectangle and
 * solids. Build one from a GameState with collisionWorld() in
 * machine-collision.ts — it spans the whole lot, with the building's
 * walls and the parked truck as solids. */
export interface CollisionWorld {
  /** Walkable world size in cells; the edges are hard bounds. */
  readonly size: Vector;
  readonly solids: ReadonlyArray<Solid>;
}

/**
 * Depenetration passes per substep. Two boxes meeting at a corner (or a
 * solid flush against a wall) can each undo the other's push; a few
 * rounds settle every realistic arrangement, and the loop exits early
 * the first pass nothing moves.
 */
const RESOLVE_PASSES = 4;

/**
 * Advance the player's continuous position by one frame: normalize the
 * input, integrate, and push the body back out of anything solid.
 *
 * The body is a circle. Each substep moves it along the input, then
 * resolves overlap against every solid by the closest-point normal —
 * so only the component of motion *into* a face is removed. Three feel
 * properties fall out: diagonal input into a face slides along it at
 * full tangential speed, outside corners round instead of catching,
 * and a body that starts the frame overlapped (a fixture teleport, a
 * machine set down over its margin) is pushed out to the nearest face
 * rather than left embedded. Substeps are capped at half the body
 * radius, so a long step (a dropped frame) cannot tunnel through a
 * solid — it lands inside and is pushed back to the face it entered.
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

  const stepX = dx * speed * dt;
  const stepY = dy * speed * dt;
  const substeps = Math.max(
    1,
    Math.ceil(Math.hypot(stepX, stepY) / (radius / 2)),
  );
  let next = pos;
  for (let i = 0; i < substeps; i++) {
    next = resolveCollisions(
      [next[0] + stepX / substeps, next[1] + stepY / substeps],
      radius,
      world,
    );
  }
  return next;
}

/** Push a circle body at `pos` out of the walls and every solid. */
function resolveCollisions(
  pos: Vector,
  radius: number,
  world: CollisionWorld,
): Vector {
  let [x, y] = pos;
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    // The world's edges: clamp to the walkable rectangle. This also
    // gently pulls in a body teleported onto the margin (fixtures,
    // loaded saves).
    x = Math.min(Math.max(x, radius), world.size[0] - radius);
    y = Math.min(Math.max(y, radius), world.size[1] - radius);
    let moved = false;
    for (const solid of world.solids) {
      const pushed =
        solid.kind === "box"
          ? pushOutOfBox([x, y], radius, solid)
          : pushOutOfCircle([x, y], radius, solid);
      if (pushed !== null) {
        [x, y] = pushed;
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  return [x, y];
}

/**
 * Where a circle body overlapping `box` must move to rest against it, or
 * null when they don't touch. Push is along the normal from the closest
 * point on the box — perpendicular to a face in face contact, radial in
 * corner contact (which is what rounds corners).
 */
function pushOutOfBox(
  pos: Vector,
  radius: number,
  box: SolidBox,
): Vector | null {
  const cx = Math.min(Math.max(pos[0], box.min[0]), box.max[0]);
  const cy = Math.min(Math.max(pos[1], box.min[1]), box.max[1]);
  const nx = pos[0] - cx;
  const ny = pos[1] - cy;
  const dist = Math.hypot(nx, ny);
  if (dist >= radius) {
    return null;
  }
  if (dist > 1e-9) {
    const scale = (radius - dist + EDGE_EPSILON) / dist;
    return [pos[0] + nx * scale, pos[1] + ny * scale];
  }
  // The center itself is inside the box (a deep teleport): exit through
  // the nearest face.
  const exits: Vector[] = [
    [box.min[0] - radius - EDGE_EPSILON - pos[0], 0],
    [box.max[0] + radius + EDGE_EPSILON - pos[0], 0],
    [0, box.min[1] - radius - EDGE_EPSILON - pos[1]],
    [0, box.max[1] + radius + EDGE_EPSILON - pos[1]],
  ];
  const best = exits.reduce((a, b) =>
    Math.hypot(a[0], a[1]) <= Math.hypot(b[0], b[1]) ? a : b,
  );
  return [pos[0] + best[0], pos[1] + best[1]];
}

/** Circle-vs-circle: push out along the line between centers. */
function pushOutOfCircle(
  pos: Vector,
  radius: number,
  solid: SolidCircle,
): Vector | null {
  const nx = pos[0] - solid.center[0];
  const ny = pos[1] - solid.center[1];
  const dist = Math.hypot(nx, ny);
  const clearance = radius + solid.radius;
  if (dist >= clearance) {
    return null;
  }
  if (dist > 1e-9) {
    const scale = (clearance + EDGE_EPSILON) / dist;
    return [solid.center[0] + nx * scale, solid.center[1] + ny * scale];
  }
  // Dead-centered on the disc: any direction is as good as another.
  return [solid.center[0] + clearance + EDGE_EPSILON, solid.center[1]];
}

/** The cell a continuous position stands in. */
export function motionCell([x, y]: Vector): Vector {
  return [Math.floor(x), Math.floor(y)];
}

/** The center of a cell, in continuous cell coordinates. */
export function cellCenter([x, y]: Vector): Vector {
  return [x + 0.5, y + 0.5];
}

/** The continuous heading matching a 4-way simulation direction. */
export function headingForDirection(direction: Direction): number {
  switch (direction) {
    case 0:
      return 0;
    case 1:
      return -Math.PI / 2;
    case 2:
      return Math.PI;
    case 3:
      return Math.PI / 2;
  }
}

/** Where the body stands and faces while working at a station. */
export interface WorkStance {
  /** Body center, in continuous cell coordinates. */
  readonly pos: Vector;
  /** Facing, in radians (playerMotion's convention). */
  readonly heading: number;
  /** The same facing as the simulation's 4-way direction. */
  readonly direction: Direction;
}

/**
 * The standard working stance at a station: body centered on the
 * operation cell, squared up to face the footprint. The bench view walks
 * the body into this stance as the camera dives in, so the zoomed-in
 * look always finds the woodworker standing at the bench the way a
 * person works at one, whatever angle they shuffled up at.
 */
export function workStance(station: {
  readonly absoluteOperationPosition: Vector | null;
  readonly occupiedCells: Vector[];
}): WorkStance | null {
  const cell = station.absoluteOperationPosition;
  if (cell === null || station.occupiedCells.length === 0) {
    return null;
  }
  const pos = cellCenter(cell);
  // Face the footprint's middle, quantized to the dominant axis: the
  // operation cell can sit off the footprint's centerline (a wide bench),
  // and the stance still squares up rather than facing a corner.
  let sumX = 0;
  let sumY = 0;
  for (const occupied of station.occupiedCells) {
    sumX += occupied[0] + 0.5;
    sumY += occupied[1] + 0.5;
  }
  const count = station.occupiedCells.length;
  const direction = directionFromInput(
    [sumX / count - pos[0], sumY / count - pos[1]],
    1,
  );
  return { pos, heading: headingForDirection(direction), direction };
}
