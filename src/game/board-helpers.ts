import { OperationOutput } from "./Machine";
import {
  Board,
  BoardDimension,
  BoardEnd,
  boardEnds,
  JointedCount,
  MaterialInstance,
  MiterAngle,
  SignedMiterAngle,
  SQUARE_END,
  SurfaceCondition,
  worseSurface,
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

/**
 * True when the board is a frame rail at the given stop: both ends
 * mitered at that magnitude, leaning toward each other (opposite signs —
 * see SignedMiterAngle). Equal-signed ends are a parallelogram, whose
 * corners can never close a frame.
 */
export function isMiteredFrameRail(board: Board, angle: MiterAngle): boolean {
  const { left, right } = boardEnds(board);
  return (
    left.kind === "mitered" &&
    right.kind === "mitered" &&
    Math.abs(left.angle) === angle &&
    left.angle === -right.angle
  );
}

/**
 * How a length cut lands on the board's ends. The saw's fence stop measures
 * the kept piece; `cutEnd` is the end that faces the blade — the kept
 * piece's fresh face — while its other end rides the stop untouched.
 */
export interface LengthCutSetup {
  /**
   * 0° is a square crosscut; anything else miters the fresh faces. Signed:
   * the head swings both ways, and both pieces' fresh ends record the same
   * signed angle (they share the cut line).
   */
  readonly angle: SignedMiterAngle | 0;
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

/** How a resaw lands on the two pieces it makes. */
export interface ResawSetup {
  /**
   * Kerf, in thickness detents. A band saw's blade is thin enough to
   * vanish at quarter-inch granularity (0); a table saw's takes a quarter
   * off the total.
   */
  readonly waste?: number;
  /** What the blade leaves on the fresh faces — the cut's finish quality. */
  readonly sawnSurface: SurfaceCondition;
}

/**
 * Splits a board along its thickness: one piece at the fence setting, one
 * offcut, instead of planing the difference into shavings.
 *
 * The fence-side piece keeps the face that rode the fence — flat only if
 * the input had a flat face to offer — and the offcut's outer face is the
 * input's far one, flat only if the board was already planed to two.
 * Neither piece can be better than one-face-jointed afterwards, because
 * the blade leaves a fresh sawn face on each. Edges and ends are
 * untouched, so both inherit them.
 */
export function resawBoard(
  inputBoard: Board,
  targetThickness: BoardDimension,
  { waste = 0, sawnSurface }: ResawSetup,
): OperationOutput {
  const { outputs } = cutBoard(inputBoard, targetThickness, "thickness", waste);
  // One surface field for the whole board: the fresh sawn face is the
  // worst of it now (see worseSurface).
  const surface = worseSurface(inputBoard.surface, sawnSurface);
  const [fenceSide, offcut] = outputs as ReadonlyArray<Board>;

  return {
    inputs: [],
    outputs: [
      makeMaterial<Board>({
        ...fenceSide,
        jointedFaces: Math.min(inputBoard.jointedFaces, 1) as JointedCount,
        surface,
      }),
      ...(offcut
        ? [
            makeMaterial<Board>({
              ...offcut,
              // The offcut's outer face is the input's far face — flat
              // only if the board was already planed to two.
              jointedFaces: inputBoard.jointedFaces === 2 ? 1 : 0,
              surface,
            }),
          ]
        : []),
    ],
  };
}
