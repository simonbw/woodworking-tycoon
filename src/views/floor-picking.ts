import { productBlueprintFor } from "../game/bench-work/blueprint";
import { getMachineOccupiedCells } from "../game/game-actions/machine-actions";
import { MaterialPile } from "../game/GameState";
import { Machine } from "../game/Machine";
import { MaterialInstance } from "../game/Materials";
import { materialExtentInches } from "../game/pile-helpers";
import { inchesToCells } from "../game/shop-scale";
import { Vector } from "../game/Vectors";

/**
 * What the cursor is pointing at on the shop floor — the arithmetic
 * behind MousePicking, kept apart from the entity so the rules can be
 * stated (and tested) on their own.
 *
 * Two rules live here. Stock outranks stations: a board lying across a
 * machine's footprint is what you're pointing at, not the machine
 * beneath it, which is what the old shell got from drawing the machines'
 * hit shapes under the loose stock. And a piece is hit against the
 * rectangle it covers rather than a radius around its middle, because of
 * long stock — an 8-foot board is pointed at anywhere along its length,
 * the same way it can be picked up anywhere along its length (see
 * pileWithinReach).
 *
 * The measurements are the ones the drawing already uses:
 * `materialExtentInches` carries the floor a board, panel, sheet, or
 * pallet covers, and a blueprint carries its product's width and height
 * — the very numbers MaterialSprite lays the art out from. Anything else
 * draws as a small glyph, and gets a square foot so it stays comfortable
 * to point at.
 */

/** The hit square for a piece that draws as a glyph, in inches. */
export const GLYPH_HIT_INCHES = 12;

/** The floor a piece's drawing covers, in inches: `across` runs along the
 * x axis, `along` down the y axis, before the pile's own rotation. */
export function materialHitExtentInches(material: MaterialInstance): {
  across: number;
  along: number;
} {
  const measured = materialExtentInches(material);
  if (measured.across > 0 && measured.along > 0) return measured;
  const blueprint = productBlueprintFor(material.type);
  if (blueprint) {
    return { across: blueprint.widthIn, along: blueprint.heightIn };
  }
  return { across: GLYPH_HIT_INCHES, along: GLYPH_HIT_INCHES };
}

/**
 * Whether a point — in continuous cell coordinates, the space
 * `pile.position` is in — lands on a pile's drawing. The offset is
 * carried into the piece's own frame first, so a board dropped
 * mid-stride is pointed at along where it actually lies.
 */
export function pileUnderPoint(pile: MaterialPile, point: Vector): boolean {
  const { across, along } = materialHitExtentInches(pile.material);
  const halfX = inchesToCells(across) / 2;
  const halfY = inchesToCells(along) / 2;
  const cos = Math.cos(pile.rotation);
  const sin = Math.sin(pile.rotation);
  const wx = point[0] - pile.position[0];
  const wy = point[1] - pile.position[1];
  const lx = wx * cos + wy * sin;
  const ly = -wx * sin + wy * cos;
  return Math.abs(lx) <= halfX && Math.abs(ly) <= halfY;
}

/** Whether a point lands on the cells a machine claims. Machines are hit
 * against their footprints because texture art has no geometry to test. */
export function machineUnderPoint(machine: Machine, point: Vector): boolean {
  const [cx, cy] = [Math.floor(point[0]), Math.floor(point[1])];
  return getMachineOccupiedCells(
    machine.type,
    machine.position,
    machine.rotation,
  ).some(([x, y]) => x === cx && y === cy);
}

export type FloorPick =
  { kind: "pile"; pile: MaterialPile } | { kind: "machine"; machine: Machine };

/**
 * What the cursor has hold of, given the pieces the interact resolver is
 * offering (newest-dropped first, the order they're drawn in) and the
 * machines within reach. The first piece hit wins outright — that's the
 * stock-over-station rule — and only then do the stations answer.
 */
export function pickUnderCursor(
  point: Vector,
  piles: ReadonlyArray<MaterialPile>,
  machines: ReadonlyArray<Machine>,
): FloorPick | null {
  for (const pile of piles) {
    if (pileUnderPoint(pile, point)) return { kind: "pile", pile };
  }
  for (const machine of machines) {
    if (machineUnderPoint(machine, point)) return { kind: "machine", machine };
  }
  return null;
}
