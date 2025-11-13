import { MachineType, ParameterizedOperation } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";

export const jobsiteTableSaw: MachineType = {
  id: "jobsiteTableSaw",
  name: "Jobsite Table Saw",
  description: "A portable table saw for cutting wood.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [
    [0, 1],
    [0, -1],
  ],
  operationPosition: [0, 1],
  cost: 300,
  materialStorage: 0,
  toolStorage: 0,
  inputSpaces: 1,
  operations: [
    {
      id: "ripBoard",
      name: "Rip Board",
      duration: 15,
      parameters: [
        {
          id: "targetWidth",
          name: "Target Width",
          values: BOARD_DIMENSIONS,
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          width: BOARD_DIMENSIONS.filter((d) => d > (params.targetWidth as BoardDimension)),
          quantity: 1,
        },
      ],
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return cutBoard(inputBoard, params.targetWidth as BoardDimension, "width");
      },
    } as ParameterizedOperation,
  ],
};
