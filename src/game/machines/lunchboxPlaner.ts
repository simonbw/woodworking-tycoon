import { BOARD_DIMENSIONS, Board, BoardDimension } from "../Materials";
import { isBoard } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { MachineType, ParameterizedOperation } from "../Machine";

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
  inputSpaces: 1,
  operations: [
    {
      id: "planeBoard",
      name: "Plane Board",
      duration: 15,
      parameters: [
        {
          id: "targetThickness",
          name: "Target Thickness",
          values: BOARD_DIMENSIONS.filter(
            // you can't plane something down to the maximum dimension
            (dimension) => dimension < Math.max(...BOARD_DIMENSIONS)
          ),
        },
      ],
      getInputMaterials: (params) => {
        const targetThickness = params.targetThickness as BoardDimension;
        // Need boards thicker than target
        const validThicknesses = BOARD_DIMENSIONS.filter(d => d > targetThickness);
        return [
          {
            type: ["board"],
            thickness: validThicknesses,
            quantity: 1,
          },
        ];
      },
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        const targetThickness = params.targetThickness as BoardDimension;
        // Same board, just thinner
        return {
          inputs: [],
          outputs: [makeMaterial<Board>({ ...inputBoard, thickness: targetThickness })],
        };
      },
    } as ParameterizedOperation,
  ],
};
