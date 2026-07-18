import { Board, MaterialInstance } from "../Materials";
import { isBoard } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { ToolType } from "../Tool";

/**
 * The slow, cheap path into rough lumber: winding sticks, elbow grease,
 * and a No. 5. Flattens a reference face or straightens an edge by hand —
 * exactly what the jointer does, minus the electricity and most of your
 * afternoon. Machines buy time; they don't gate products.
 */
export const handPlane: ToolType = {
  id: "handPlane",
  name: "Hand Plane",
  description:
    "Flatten a face or straighten an edge the old way. Slow, quiet, and deeply satisfying.",
  cost: 35,
  operations: [
    {
      id: "handPlaneFace",
      name: "Flatten Face by Hand",
      requiredSkill: "basicMilling",
      duration: 35,
      inputMaterials: [
        { type: ["board"], jointedFaces: [0], quantity: 1 },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<Board>({ ...inputBoard, jointedFaces: 1 }),
          ],
        };
      },
    },
    {
      id: "handPlaneEdge",
      name: "Straighten Edge by Hand",
      requiredSkill: "basicMilling",
      duration: 30,
      inputMaterials: [
        { type: ["board"], jointedEdges: [0], quantity: 1 },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<Board>({ ...inputBoard, jointedEdges: 1 }),
          ],
        };
      },
    },
  ],
};
