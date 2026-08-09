import { OperationOutput } from "./Machine";
import { MaterialInstance, SheetGood } from "./Materials";
import { makeMaterial } from "./material-helpers";

/**
 * Sheet goods are cut, not milled. A sheet has no species, no grain to
 * follow and no surface ladder — the only thing a saw changes about one
 * is how big it is. So where boards get `cutBoard`, `resawBoard` and a
 * pile of milling axes, sheets get exactly this: split one in two along
 * one of its cross dimensions (see docs/sheet-goods.md).
 *
 * Which dimension is "length" and which is "width" is the sheet's own
 * bookkeeping, not the cut's: a rip runs the length and narrows the
 * width, a crosscut runs the width and shortens the length. Both come
 * through here.
 */

export function isSheetGood(
  material: MaterialInstance,
): material is SheetGood & MaterialInstance {
  return material.type === "plywood";
}

/**
 * Split a sheet at `outputSize` along one dimension. The kept piece
 * comes back first and the offcut second, the way cutBoard orders them,
 * and both are fresh materials with fresh ids — two pieces sharing the
 * input's id would be indistinguishable to everything id-keyed.
 *
 * No kerf: the blade's eighth of an inch is real, but charging it here
 * would mean a 48" sheet cut at 24" yields 24 and 23⅞, and every part
 * size in the game would drift off the inch. Board rips don't charge it
 * either (cutBoard's `waste` is zero for every cut on the saw) — the
 * kerf shows up as dust on the floor instead, which is where the player
 * actually meets it.
 */
export function cutSheet(
  sheet: SheetGood,
  outputSize: number,
  dimension: "length" | "width",
): OperationOutput {
  const startingDimension = sheet[dimension];
  if (startingDimension <= outputSize) {
    throw new Error("Sheet is too small to cut");
  }
  return {
    inputs: [],
    outputs: [
      makeSheet({ ...sheet, [dimension]: outputSize }),
      makeSheet({ ...sheet, [dimension]: startingDimension - outputSize }),
    ],
  };
}

/**
 * A sheet, with its long side called its length.
 *
 * A board has a grain direction, so which dimension is its length is a
 * fact about the wood. A sheet doesn't: a 24×48 piece and a 48×24 piece
 * are the same piece, turned. Storing them differently would mean every
 * recipe asking for one had to ask for it both ways round, so instead
 * every sheet is normalized on the way out of the saw and a requirement
 * can state one orientation and mean either.
 */
export function makeSheet(sheet: Omit<SheetGood, "id">): SheetGood {
  const long = Math.max(sheet.length, sheet.width);
  const short = Math.min(sheet.length, sheet.width);
  return makeMaterial<SheetGood>({ ...sheet, length: long, width: short });
}
