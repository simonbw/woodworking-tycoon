import { MachineType, ParameterizedOperation } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";

export const miterSaw: MachineType = {
  id: "miterSaw",
  name: "Miter Saw",
  description: "A portable saw for cross cutting wood.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [],
  operationPosition: [0, 1],
  cost: 150,
  materialStorage: 0,
  toolStorage: 0,
  inputSpaces: 1,
  operations: [
    {
      id: "cutBoard",
      name: "Cut Board",
      duration: 15,
      parameters: [
        {
          id: "targetLength",
          name: "Target Length",
          values: BOARD_DIMENSIONS,
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          length: BOARD_DIMENSIONS.filter((d) => d > (params.targetLength as BoardDimension)),
          quantity: 1,
        },
      ],
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return cutBoard(inputBoard, params.targetLength as BoardDimension, "length");
      },
    } as ParameterizedOperation,
  ],
};
