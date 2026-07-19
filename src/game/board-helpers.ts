import { OperationOutput } from "./Machine";
import {
  Board,
  BoardDimension,
  JointedCount,
  MaterialInstance,
} from "./Materials";
import { makeMaterial } from "./material-helpers";

/** Syntactic sugar to create a board material instance */

export function board(
  species: Board["species"] = "pallet",
  length: Board["length"] = 1,
  width: Board["width"] = 1,
  thickness: Board["thickness"] = 1,
  surface: Board["surface"] = "rough",
  jointed: { faces?: JointedCount; edges?: JointedCount } = {},
): MaterialInstance & { type: "board" } {
  return makeMaterial({
    type: "board",
    species,
    length,
    width,
    thickness,
    surface,
    // Defaults keep pre-milling content working: smooth stock is fully
    // milled, and rough boards still have one flat face and factory-cut
    // edges — true for pallet wood, which was milled once before it
    // weathered. Genuinely unmilled lumber passes explicit zeros.
    jointedFaces: jointed.faces ?? (surface === "rough" ? 1 : 2),
    jointedEdges: jointed.edges ?? 2,
  });
}

export function isBoard(material: MaterialInstance): material is Board {
  return material.type === "board";
}

/** Takes an input board and cuts it into two boards of the specified size */
export function cutBoard(
  inputBoard: Board,
  outputSize: BoardDimension,
  dimension: "length" | "width" | "thickness",
  waste: number = 0,
): OperationOutput {
  const startingDimension = inputBoard[dimension];

  if (startingDimension <= outputSize) {
    throw new Error("Board is too small to cut");
  }

  const outputs = [{ ...inputBoard, [dimension]: outputSize }];

  const offcutSize = startingDimension - outputSize - waste;
  if (offcutSize > 0) {
    outputs.push({ ...inputBoard, [dimension]: offcutSize });
  }

  return {
    inputs: [],
    outputs,
  };
}
