import { Board, MaterialInstance } from "../Materials";
import { isBoard } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { MachineType } from "../Machine";

/**
 * The flattening machine. A jointer makes one face flat (the reference the
 * planer needs) and one edge straight-and-square (referenced off a flat
 * face against the fence). It can't make anything *parallel* — that's the
 * planer's job for faces and the table saw's for edges — so each axis only
 * ever goes 0 → 1 here.
 */
export const jointer: MachineType = {
  id: "jointer",
  name: "Jointer",
  description:
    "Flattens a reference face and straightens an edge. Rough lumber starts here.",
  cellsOccupied: [[0, 0]],
  // Infeed and outfeed: boards travel the long way across the tables
  freeCellsNeeded: [
    [0, 1],
    [0, -1],
  ],
  operationPosition: [0, 1],
  outputPosition: [0, -1],
  cost: 600,
  materialStorage: 0,
  toolSlots: 0,
  inputSpaces: 1,
  operations: [
    {
      id: "jointFace",
      requiredSkill: "basicMilling",
      name: "Joint Face",
      duration: 10,
      inputMaterials: [{ type: ["board"], jointedFaces: [0], quantity: 1 }],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        // One flat face; the rest of the board is as rough as it came
        return {
          inputs: [],
          outputs: [makeMaterial<Board>({ ...inputBoard, jointedFaces: 1 })],
        };
      },
    },
    {
      id: "jointEdge",
      requiredSkill: "basicMilling",
      name: "Joint Edge",
      duration: 8,
      inputMaterials: [
        {
          type: ["board"],
          // Edge squareness references a flat face against the fence
          jointedFaces: [1, 2],
          jointedEdges: [0],
          quantity: 1,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return {
          inputs: [],
          outputs: [makeMaterial<Board>({ ...inputBoard, jointedEdges: 1 })],
        };
      },
    },
  ],
};
