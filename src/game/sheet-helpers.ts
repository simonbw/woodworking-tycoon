import { OperationOutput } from "./Machine";
import { MaterialInstance, SheetFaceRegion, SheetGood } from "./Materials";
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
  // Both pieces stay on the source sheet's face: the kept piece keeps
  // the input's region (materialized, because the input's id — which a
  // virgin sheet's region is seeded by — dies with the cut), and the
  // offcut starts where the blade fell. Which source axis the cut
  // advances along depends on how this piece sits on its source.
  const face = sheetFaceRegion(sheet);
  const cutAxis = (dimension === "length") !== face.rotated ? "u" : "v";
  const offcutFace = { ...face, [cutAxis]: face[cutAxis] + outputSize };
  return {
    inputs: [],
    outputs: [
      makeSheet({ ...sheet, [dimension]: outputSize, face }),
      makeSheet({
        ...sheet,
        [dimension]: startingDimension - outputSize,
        face: offcutFace,
      }),
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
  if (sheet.width <= sheet.length) {
    return makeMaterial<SheetGood>(sheet);
  }
  // Swapping the labels turns the piece a quarter against its source
  // sheet, and the face region has to remember that (see SheetFaceRegion)
  return makeMaterial<SheetGood>({
    ...sheet,
    length: sheet.width,
    width: sheet.length,
    face: sheet.face && { ...sheet.face, rotated: !sheet.face.rotated },
  });
}

/**
 * A sheet's face region with the virgin-sheet default applied: a piece
 * that was never cut is its own source, sitting at the source's origin,
 * unrotated.
 */
export function sheetFaceRegion(sheet: SheetGood): SheetFaceRegion {
  return sheet.face ?? { seed: sheet.id, u: 0, v: 0, rotated: false };
}

/**
 * The point on the source sheet's face that a point on this piece's
 * face shows — both in inches, the piece's measured (along its length,
 * across its width) from its origin corner. This is the whole contract
 * between the cut bookkeeping and the renderer: two pieces of one sheet
 * agree wherever they meet, so the veneer runs unbroken across a cut.
 */
export function sheetFacePoint(
  face: SheetFaceRegion,
  alongLength: number,
  acrossWidth: number,
): { u: number; v: number } {
  return face.rotated
    ? { u: face.u + acrossWidth, v: face.v + alongLength }
    : { u: face.u + alongLength, v: face.v + acrossWidth };
}
