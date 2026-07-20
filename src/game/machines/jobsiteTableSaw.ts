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
  outputPosition: [0, -1],
  cost: 300,
  materialStorage: 0,
  // One jig at a time — the crosscut sled is the first
  toolSlots: 1,
  inputSpaces: 1,
  operations: [
    {
      id: "ripBoard",
      requiredSkill: "basicMilling",
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
          width: BOARD_DIMENSIONS.filter(
            (d) => d > (params.targetWidth as BoardDimension),
          ),
          // Never rip a rough edge against the fence — kickback city.
          // Straight-line it first (jointer, sled, or hand plane).
          jointedEdges: [1, 2],
          quantity: 1,
        },
      ],
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        const result = cutBoard(
          inputBoard,
          params.targetWidth as BoardDimension,
          "width",
        );
        // The fence-side piece gains a saw-straight second edge; the offcut
        // keeps whatever the input had (its far edge is unchanged).
        const [kept, ...offcuts] = result.outputs;
        return {
          ...result,
          outputs: [{ ...kept, jointedEdges: 2 as const }, ...offcuts],
        };
      },
    } as ParameterizedOperation,
  ],
};
