import {
  InputMaterialWithQuantity,
  MachineOperation,
  MachineType,
} from "../Machine";
import { BOARD_DIMENSIONS, Board } from "../Materials";
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
    ...BOARD_DIMENSIONS.map(
      (width): MachineOperation => ({
        name: `Rip Board - ${width}'`,
        id: `ripBoard${width}`,
        duration: 15,
        inputMaterials: [
          {
            type: ["board"] as const,
            width: BOARD_DIMENSIONS.filter((d) => d > width),
            quantity: 1,
          } satisfies InputMaterialWithQuantity<Board>,
        ],
        output: (materials) => {
          const inputBoard = materials[0];
          if (!isBoard(inputBoard)) {
            throw new Error("Input material is not a board");
          }
          return cutBoard(inputBoard, width, "width");
        },
      })
    ),
  ],
};
