import { MachineOperation, MachineType } from "../Machine";
import { BOARD_DIMENSIONS } from "../Materials";
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
  operations: [
    ...BOARD_DIMENSIONS.map(
      (length): MachineOperation => ({
        name: `Cut Board ${length}"`,
        id: `cutBoard${length}`,
        duration: 15,
        inputMaterials: [
          {
            type: ["board"],
            length: BOARD_DIMENSIONS.filter((d) => d > length),
            quantity: 1,
          },
        ],
        output: (materials) => {
          const inputBoard = materials[0];
          if (!isBoard(inputBoard)) {
            throw new Error("Input material is not a board");
          }
          return cutBoard(inputBoard, length, "length");
        },
      })
    ),
  ],
};
