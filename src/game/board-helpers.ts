import { OperationOutput } from "./Machine";
import {
  Board,
  BoardDimension,
  BoardEnd,
  boardEnds,
  JointedCount,
  MaterialInstance,
  MiterAngle,
  SQUARE_END,
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

/** True when both of a board's ends are mitered at the given angle. */
export function isMiteredBothEnds(board: Board, angle: MiterAngle): boolean {
  const { left, right } = boardEnds(board);
  return (
    left.kind === "mitered" &&
    left.angle === angle &&
    right.kind === "mitered" &&
    right.angle === angle
  );
}

/**
 * How a length cut lands on the board's ends. The saw's fence stop measures
 * the kept piece; `cutEnd` is the end that faces the blade — the kept
 * piece's fresh face — while its other end rides the stop untouched.
 */
export interface LengthCutSetup {
  /** 0° is a square crosscut; anything else miters the fresh faces. */
  readonly angle: MiterAngle | 0;
  /** Which end of the input board gets cut off (and freshly re-faced). */
  readonly cutEnd: "left" | "right";
}

const SQUARE_LENGTH_CUT: LengthCutSetup = { angle: 0, cutEnd: "left" };

/**
 * Takes an input board and cuts it into two boards of the specified size.
 * Length cuts track end treatments: the blade leaves a fresh face (square
 * or mitered, per `lengthCut`) on both resulting pieces, and each piece
 * keeps the input's end on its far side. Width and thickness cuts run along
 * the board, so both pieces inherit the input's ends unchanged.
 */
export function cutBoard(
  inputBoard: Board,
  outputSize: BoardDimension,
  dimension: "length" | "width" | "thickness",
  waste: number = 0,
  lengthCut: LengthCutSetup = SQUARE_LENGTH_CUT,
): OperationOutput {
  const startingDimension = inputBoard[dimension];

  if (startingDimension <= outputSize) {
    throw new Error("Board is too small to cut");
  }

  const offcutSize = startingDimension - outputSize - waste;

  if (dimension !== "length") {
    const outputs = [{ ...inputBoard, [dimension]: outputSize }];
    if (offcutSize > 0) {
      outputs.push({ ...inputBoard, [dimension]: offcutSize });
    }
    return { inputs: [], outputs };
  }

  const { angle, cutEnd } = lengthCut;
  const freshEnd: BoardEnd =
    angle === 0 ? SQUARE_END : { kind: "mitered", angle };
  const ends = boardEnds(inputBoard);

  // The kept piece's fresh face is on the cut end; the offcut's fresh face
  // is on its side toward the blade — the opposite label.
  const kept = {
    ...inputBoard,
    length: outputSize,
    ends: { ...ends, [cutEnd]: freshEnd },
  };
  const outputs = [kept];
  if (offcutSize > 0) {
    const offcutFreshEnd = cutEnd === "left" ? "right" : "left";
    outputs.push({
      ...inputBoard,
      length: offcutSize as BoardDimension,
      ends: { ...ends, [offcutFreshEnd]: freshEnd },
    });
  }

  return { inputs: [], outputs };
}
