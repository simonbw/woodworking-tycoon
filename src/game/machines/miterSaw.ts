import { MachineType, ParameterizedOperation } from "../Machine";
import {
  BOARD_DIMENSIONS,
  BoardDimension,
  MITER_ANGLES,
  MiterAngle,
} from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";

/** The saw's detents, measured off square — 0° is a plain crosscut. */
export const SAW_ANGLE_STOPS = [0, ...MITER_ANGLES] as const;

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
  inputSpaces: 1,
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
            angle: (params.angle as MiterAngle | 0) ?? 0,
            cutEnd: (params.cutEnd as "left" | "right") ?? "left",
          },
        );
      },
    } as ParameterizedOperation,
  ],
};
