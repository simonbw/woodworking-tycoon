import { Machine } from "./Machine";
import { SolidBox } from "./player-motion";
import { rotateVec, Vector } from "./Vectors";

/**
 * Turns placed machines into the world-space solid boxes the movement
 * sweep collides against (see stepPlayerMotion). A machine with a
 * collision box (MachineType.collisionBox — measured from its sprite art
 * or hand-set) blocks exactly that box, rotated with the placement; a
 * machine without one blocks its whole occupied tiles. Placement,
 * targeting, and attendance still work on whole cells — only the walking
 * body sees these boxes.
 */

/**
 * A placed machine's collision box in world cell coordinates (cell [x, y]
 * spans x..x+1), or null when the type has none and its whole tiles block.
 */
export function machineWorldBox(machine: Machine): SolidBox | null {
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

/** The solid boxes one machine contributes: its collision box, or one
 * full box per occupied tile when it has none. */
export function machineSolids(machine: Machine): SolidBox[] {
  const box = machineWorldBox(machine);
  if (box !== null) {
    return [box];
  }
  return machine.type.cellsOccupied.map((cell) => {
    const [x, y] = machine.localToShop(cell);
    return { min: [x, y] as Vector, max: [x + 1, y + 1] as Vector };
  });
}

/** Everything solid on the shop floor. A benchtop machine mounted on a
 * worktable contributes its own box and the table contributes its tiles —
 * overlapping solids just block twice, which is fine. */
export function shopSolids(machines: ReadonlyArray<Machine>): SolidBox[] {
  return machines.flatMap(machineSolids);
}
