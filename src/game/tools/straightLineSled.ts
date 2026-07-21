import { Board, MaterialInstance } from "../Materials";
import { isBoard } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { ToolType } from "../Tool";

/**
 * Shop-made jig #2: a long plywood sled that carries a wavy-edged board
 * past the blade. Because the board rides the sled — not the fence — it
 * needs no straight edge and no flat face to start from. That's the
 * budget path into S2S and rough lumber; a jointer just does it faster
 * (and gets the face too).
 */
export const straightLineSled: ToolType = {
  id: "straightLineSled",
  name: "Straight-Line Sled",
  description:
    "A sled that rides the rails so the board doesn't have to trust the fence. Turns a wavy edge into a straight one.",
  cost: 0,
  craftedOnly: true,
  compatibleMachines: ["jobsiteTableSaw"],
  operations: [
    {
      id: "straightLineRip",
      name: "Straight-Line Rip",
      requiredSkill: "jigsAndFixtures",
      duration: 18,
      dustOutput: 1.6,
      inputMaterials: [{ type: ["board"], jointedEdges: [0], quantity: 1 }],
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
