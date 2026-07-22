import { MachineType, ParameterizedOperation } from "../Machine";
import {
  BOARD_DIMENSIONS,
  BoardDimension,
  SignedMiterAngle,
} from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";

/**
 * The saw's detents — the head swings both ways off square, like the real
 * detent plate, because mirrored cuts are how a frame rail's two ends get
 * made without flipping the stock. 0° is a plain crosscut.
 */
export const SAW_ANGLE_STOPS = [
  -45, -30, -22.5, 0, 22.5, 30, 45,
] as const;

export const miterSaw: MachineType = {
  id: "miterSaw",
  name: "Miter Saw",
  description: "A portable saw for cross cutting wood, square or at an angle.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [],
  operationPosition: [0, 1],
  cost: 150,
  materialStorage: 0,
  toolSlots: 1,
  // Direct feed, trigger-style: set the head to an angle stop, hold the
  // carried board against the fence, pull the trigger. Nothing is "loaded";
  // the cut pieces stay on the saw table until collected.
  inputSpaces: 0,
  directFeed: true,
  feedVerb: "Cut",
  // Small enough to mount on a worktable cell instead of the floor
  benchtop: true,
  operations: [
    {
      id: "cutBoard",
      requiredSkill: "basicMilling",
      name: "Cut Board",
      duration: 15,
      dustOutput: 1,
      // Set up the saw, don't pick a recipe: swing the blade to an angle
      // stop, choose which end of the stock faces the blade, and set the
      // stop for the kept piece's length.
      parameters: [
        {
          id: "angle",
          name: "Angle",
          values: SAW_ANGLE_STOPS,
          // The head rests square, mid-swing
          defaultValue: 0,
          unit: "°",
        },
        {
          id: "cutEnd",
          name: "Cut End",
          values: ["left", "right"],
          unit: "",
        },
        {
          id: "targetLength",
          name: "Target Length",
          values: BOARD_DIMENSIONS,
          unit: "'",
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          length: BOARD_DIMENSIONS.filter(
            (d) => d > (params.targetLength as BoardDimension),
          ),
          quantity: 1,
        },
      ],
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return cutBoard(
          inputBoard,
          params.targetLength as BoardDimension,
          "length",
          0,
          {
            // Saves from before the angle stops carry only targetLength;
            // they cut the way the saw always did — square, left end.
            angle: (params.angle as SignedMiterAngle | 0) ?? 0,
            cutEnd: (params.cutEnd as "left" | "right") ?? "left",
          },
        );
      },
    } as ParameterizedOperation,
  ],
};
