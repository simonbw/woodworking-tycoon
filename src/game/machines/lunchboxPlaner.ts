import { BOARD_DIMENSIONS, Board, BoardDimension } from "../Materials";
import { isBoard } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { MachineType, MachineOperation } from "../Machine";

export const lunchboxPlaner: MachineType = {
  id: "planer",
  name: "Planer",
  description: "A lunchbox planer",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [],
  operationPosition: [0, 1],
  cost: 450,
  materialStorage: 0,
  toolStorage: 0,
  operations: [
    ...BOARD_DIMENSIONS.filter(
      // you can't plane something down to the maximum dimension
      (dimension) => dimension < Math.max(...BOARD_DIMENSIONS)
    ).map(
      (thickness): MachineOperation => ({
        name: `Plane Board to ${thickness}/4`,
        id: `planeBoard${thickness}`,
        duration: 15,
        inputMaterials: [
          {
            type: ["board"],
            thickness: [(thickness + 1) as BoardDimension],
            quantity: 1,
          },
        ],
        output: (materials) => {
          const inputBoard = materials[0];
          if (!isBoard(inputBoard)) {
            throw new Error("Input material is not a board");
          }
          // Same board, just thinner
          return {
            inputs: [],
            outputs: [makeMaterial({ ...inputBoard, thickness } as Board)],
          };
        },
      })
    ),
  ],
};
