import { stockOrientationParameter } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { isBoard, resawBoard } from "../board-helpers";
import { ToolType } from "../Tool";

/**
 * How wide a board the table saw can split. The blade only rises so far,
 * so a resaw is two passes — one from each edge — and anything wider than
 * twice the blade height keeps a rib of uncut wood in the middle.
 */
export const TABLE_SAW_RESAW_CAPACITY = 6;

/**
 * Shop-made jig #3: a tall plywood face bolted to the rip fence, so a
 * board can stand on edge without tipping. It's the table saw's way into
 * resawing — cheaper than a band saw, and worse at it: the blade takes a
 * quarter-inch of the board away as dust, and the two passes have to meet
 * in the middle, which caps how wide a board it can split.
 *
 * What it gives back is the cut itself. A rip blade leaves a cleaner face
 * than a band saw blade does, so a smooth board resawn here stays smooth.
 *
 * Mounting it stands the saw's work on edge; press R to lay the stock
 * back flat and rip with the ordinary fence face instead — the tall face
 * stays bolted on either way.
 */
export const resawFence: ToolType = {
  id: "resawFence",
  name: "Tall Resaw Fence",
  description:
    "A tall plywood face for the rip fence, so stock can stand on edge. " +
    "Adds resawing to the table saw; R turns the stock between resawing " +
    "on edge and ripping flat.",
  cost: 0,
  craftedOnly: true,
  compatibleMachines: ["jobsiteTableSaw"],
  operations: [
    {
      id: "resawOnTableSaw",
      name: "Resaw",
      requiredSkill: "resawing",
      // Mounting the fence is what gives the saw an on-edge mode at all,
      // and freshly mounted it starts there — that's what it's for. The
      // table saw's own rip runs with the stock flat, so the pair stays
      // disjoint (see orientedOperations).
      stockOrientation: "on edge",
      // Two passes and a flip, and you're feeding it by hand the whole way.
      duration: 25,
      dustOutput: 2.4,
      parameters: [
        stockOrientationParameter("on edge"),
        {
          id: "targetThickness",
          name: "Fence",
          values: BOARD_DIMENSIONS,
          defaultValue: 4,
          unit: "/4",
        },
      ],
      getInputMaterials: (params) => {
        const fence = params.targetThickness as BoardDimension;
        return [
          {
            type: ["board"],
            // The kerf eats a detent, so the stock has to be thick enough
            // to give both a piece at the fence and something left over.
            thickness: BOARD_DIMENSIONS.filter((d) => d > fence + 1),
            width: BOARD_DIMENSIONS.filter(
              (d) => d <= TABLE_SAW_RESAW_CAPACITY,
            ),
            // Standing on edge, the board trusts the fence with one face
            // and the table with one edge. Both have to be true.
            jointedFaces: [1, 2],
            jointedEdges: [1, 2],
            quantity: 1,
          },
        ];
      },
      explainRejection: (material, params) => {
        if (!isBoard(material)) {
          return null;
        }
        if (material.jointedFaces === 0) {
          return "No flat reference face — the fence has nothing true to ride against. Joint a face first.";
        }
        if (material.jointedEdges === 0) {
          return "A rough edge won't stand square on the table — joint an edge before standing this one up.";
        }
        if (material.width > TABLE_SAW_RESAW_CAPACITY) {
          return `The blade only comes up so far — two passes reach ${TABLE_SAW_RESAW_CAPACITY}", and this board is wider. That's a band saw cut.`;
        }
        const fence = params?.targetThickness as number;
        if (material.thickness <= fence + 1) {
          return `The fence is at ${fence}/4 and the blade eats a quarter — the stock needs to be thicker than ${fence + 1}/4 to come away in two pieces.`;
        }
        return null;
      },
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return resawBoard(
          inputBoard,
          params.targetThickness as BoardDimension,
          // A quarter-inch of the board leaves as dust, but the faces
          // come off the blade clean.
          { waste: 1, sawnSurface: "smooth" },
        );
      },
    },
  ],
};
