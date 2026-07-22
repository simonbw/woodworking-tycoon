import { CellInfo } from "./CellMap";
import { Machine } from "./Machine";
import { CellInsets, SOLID_CELL } from "./player-motion";
import { rotateVec, Vector } from "./Vectors";

/**
 * Turns machines' collision boxes (MachineType.collisionBox) into the
 * per-cell edge insets the movement sweep collides against. Boxes live in
 * the machine's local frame; here they're rotated with the machine and
 * clipped to each occupied cell.
 */

/**
 * The most a machine's solid area may sit in from a tile edge. Strictly
 * below PLAYER_RADIUS so the player's center can never cross into an
 * occupied cell no matter how slim the art: GameState's cell-underfoot
 * bookkeeping (targeting, attendance, the inspector) never sees the player
 * standing "in" a machine. Enforced in machine-collision.test.ts.
 */
export const MAX_COLLISION_INSET = 0.25;

/**
 * A placed machine's collision box in world cell coordinates (cell [x, y]
 * spans x..x+1), or null when the type has none and its whole tiles block.
 */
export function machineWorldBox(
  machine: Machine,
): { min: Vector; max: Vector } | null {
  const box = machine.type.collisionBox;
  if (box === undefined) {
    return null;
  }
  const [cx, cy] = machine.position;
  const a = rotateVec(box.min, machine.rotation);
  const b = rotateVec(box.max, machine.rotation);
  return {
    min: [cx + 0.5 + Math.min(a[0], b[0]), cy + 0.5 + Math.min(a[1], b[1])],
    max: [cx + 0.5 + Math.max(a[0], b[0]), cy + 0.5 + Math.max(a[1], b[1])],
  };
}

const clampInset = (inset: number) =>
  Math.min(Math.max(inset, 0), MAX_COLLISION_INSET);

/** The machine's solid area clipped to one occupied cell, as edge insets. */
export function machineCellInsets(
  machine: Machine,
  [x, y]: Vector,
): CellInsets {
  const box = machineWorldBox(machine);
  if (box === null) {
    return SOLID_CELL;
  }
  return {
    left: clampInset(box.min[0] - x),
    right: clampInset(x + 1 - box.max[0]),
    top: clampInset(box.min[1] - y),
    bottom: clampInset(y + 1 - box.max[1]),
  };
}

/** The tighter (more solid) of two obstructions, side by side. */
function combineInsets(a: CellInsets, b: CellInsets): CellInsets {
  return {
    left: Math.min(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

/**
 * What blocks walking at one cell: undefined for open floor, edge insets
 * otherwise. Off the floor entirely is solid wall; a machine blocks its
 * collision box; a benchtop machine mounted on a worktable contributes the
 * table's box too (the table is still under it).
 */
export function cellObstruction(
  info: CellInfo | undefined,
  cell: Vector,
): CellInsets | undefined {
  if (info === undefined) {
    return SOLID_CELL;
  }
  if (info.machine === undefined) {
    return undefined;
  }
  let insets = machineCellInsets(info.machine, cell);
  if (info.tableMachine !== undefined) {
    insets = combineInsets(insets, machineCellInsets(info.tableMachine, cell));
  }
  return insets;
}
