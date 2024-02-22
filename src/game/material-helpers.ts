import { idMaker } from "../utils/idMaker";
import { Board, BoardDimension, MaterialInstance } from "./Materials";

const makeId = idMaker();

export function makeMaterial<T extends MaterialInstance>(
  materialInitializer: Omit<T, "id">
): T {
  return {
    id: `m-${makeId()}`,
    ...materialInitializer,
  } as T; // TODO: Why is this cast necessary?
}

/** Syntactic sugar to create a board material instance */
export function board(
  species: Board["species"] = "pallet",
  length: Board["length"] = 1,
  width: Board["width"] = 1,
  thickness: Board["thickness"] = 1
): MaterialInstance & { type: "board" } {
  return makeMaterial({
    type: "board",
    species,
    length,
    width,
    thickness,
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
  waste: number = 0
): [Board, Board] {
  const startingDimension = inputBoard[dimension];

  if (startingDimension <= outputSize) {
    throw new Error("Board is too small to cut");
  }

  const offcutSize = (inputBoard.length - outputSize - waste) as BoardDimension;

  return [
    { ...inputBoard, [dimension]: outputSize },
    { ...inputBoard, [dimension]: offcutSize },
  ];
}
