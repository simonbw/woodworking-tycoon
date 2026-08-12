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
    "A bench plane. Flattens a face or straightens an edge without a jointer, at hand-tool speed.",
  cost: 35,
  // A hand tool belongs on a bench, not clamped into a jointer's jig slot.
  compatibleMachines: ["workspace", "worktable1x1", "worktable1x2"],
  operations: [
    {
      id: "handPlaneFace",
      name: "Flatten Face by Hand",
      requiredSkill: "basicMilling",
      duration: 35,
      // Strokes along the face; shavings, not dust, but the sim doesn't
      // care what shape the mess takes
      interaction: {
        kind: "stroke",
        band: "face",
        brushWidthIn: 2,
        coveragePerSecond: 14,
      },
      dustOutput: 0.2,
      getInputMaterials: () => [
        { type: ["board"], jointedFaces: [0], quantity: 1 },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return {
          inputs: [],
          outputs: [makeMaterial<Board>({ ...inputBoard, jointedFaces: 1 })],
        };
      },
    },
    {
      id: "handPlaneEdge",
      name: "Straighten Edge by Hand",
      requiredSkill: "basicMilling",
      duration: 30,
      // Strokes constrained to the narrow edge band
      interaction: {
        kind: "stroke",
        band: "edge",
        brushWidthIn: 1.5,
        coveragePerSecond: 8,
      },
      dustOutput: 0.2,
      getInputMaterials: () => [
        { type: ["board"], jointedEdges: [0], quantity: 1 },
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
