import { CollisionShape, Machine } from "./Machine";
import { Solid, SolidBox } from "./player-motion";
import { rotateVec, Vector, vectorKey } from "./Vectors";

/**
 * Turns placed machines into the world-space solids the movement step
 * collides against (see stepPlayerMotion). A machine with collision
 * shapes (MachineType.collisionShapes — measured from its sprite art or
 * hand-set) blocks exactly those shapes, rotated with the placement; a
 * machine without any blocks its occupied tiles, merged into as few
 * boxes as the footprint allows. Placement, targeting, and attendance
 * still work on whole cells — only the walking body sees these solids.
 */

/** One local-frame shape in world cell coordinates (cell [x, y] spans
 * x..x+1). Rotation is a quarter-turn multiple, so a rotated box is
 * still exactly a box. */
function shapeToWorld(shape: CollisionShape, machine: Machine): Solid {
  const [cx, cy] = machine.position;
  if (shape.kind === "circle") {
    const [x, y] = rotateVec(shape.center, machine.rotation);
    return {
      kind: "circle",
      center: [cx + 0.5 + x, cy + 0.5 + y],
      radius: shape.radius,
    };
  }
  const a = rotateVec(shape.min, machine.rotation);
  const b = rotateVec(shape.max, machine.rotation);
  return {
    kind: "box",
    min: [cx + 0.5 + Math.min(a[0], b[0]), cy + 0.5 + Math.min(a[1], b[1])],
    max: [cx + 0.5 + Math.max(a[0], b[0]), cy + 0.5 + Math.max(a[1], b[1])],
  };
}

/**
 * A boxless machine's occupied tiles as merged solid boxes: greedy
 * row-strips, then strips with identical x-spans fused vertically — a
 * 4×4 worktable is one box, not sixteen. Fewer solids means fewer seams
 * for the depenetration pass to meet and a cheaper per-frame loop.
 */
export function mergedTileBoxes(cells: ReadonlyArray<Vector>): SolidBox[] {
  const remaining = new Set(cells.map(vectorKey));
  const strips: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const [x, y] of [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    if (!remaining.has(vectorKey([x, y]))) continue;
    let x1 = x;
    while (remaining.has(vectorKey([x1 + 1, y]))) x1++;
    for (let i = x; i <= x1; i++) remaining.delete(vectorKey([i, y]));
    const above = strips.find((s) => s.x0 === x && s.x1 === x1 && s.y1 === y);
    if (above) {
      above.y1 = y + 1;
    } else {
      strips.push({ x0: x, x1, y0: y, y1: y + 1 });
    }
  }
  return strips.map((s) => ({
    kind: "box",
    min: [s.x0, s.y0],
    max: [s.x1 + 1, s.y1],
  }));
}

/** The solids one machine contributes: its collision shapes, or its
 * occupied tiles (merged) when it has none. */
export function machineSolids(machine: Machine): Solid[] {
  const shapes = machine.type.collisionShapes;
  if (shapes !== undefined) {
    return shapes.map((shape) => shapeToWorld(shape, machine));
  }
  return mergedTileBoxes(
    machine.type.cellsOccupied.map((cell) => machine.localToShop(cell)),
  );
}

/** Everything solid on the shop floor. A benchtop machine mounted on a
 * worktable contributes its own shapes and the table contributes its
 * tiles — overlapping solids just block twice, which is fine. */
export function shopSolids(machines: ReadonlyArray<Machine>): Solid[] {
  return machines.flatMap(machineSolids);
}
