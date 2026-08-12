import { MachineType, stockOrientationParameter } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { cutBoard, isBoard, resawBoard } from "../board-helpers";
import { GENERATED_COLLISION_SHAPES } from "../machine-collision-boxes.generated";
import { cutSheet, isSheetGood } from "../sheet-helpers";

/**
 * How far the rip fence travels from the blade, in inches. A jobsite
 * saw's fence is short — everything past this is what a cabinet saw is
 * for. The cap only ever limits the piece against the fence; whatever
 * falls off the far side can be any width, which is why breaking a
 * sheet down is a series of cuts that each keep the small side.
 */
export const RIP_FENCE_CAPACITY_IN = 24;

/**
 * How wide a board the table saw can split. The blade only rises so far,
 * so a resaw is two passes — one from each edge — and anything wider than
 * twice the blade height keeps a rib of uncut wood in the middle.
 */
export const TABLE_SAW_RESAW_CAPACITY = 6;

/** The fence's detents for sheet work: every inch out to its capacity. */
const SHEET_FENCE_WIDTHS = Array.from(
  { length: RIP_FENCE_CAPACITY_IN - 1 },
  (_, index) => index + 2,
);

export const jobsiteTableSaw: MachineType = {
  id: "jobsiteTableSaw",
  name: "Jobsite Table Saw",
  description:
    "A portable table saw. Rips boards to width, splits them on edge, and hosts shop-built sleds.",
  // A jobsite saw on its stand: about 24" × 19", table biased toward the
  // infeed side — a 3×2-ft footprint with the tabletop overhanging the
  // operator side a few inches (see the measured collision box).
  cellsOccupied: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  collisionShapes: GENERATED_COLLISION_SHAPES.jobsiteTableSaw,
  freeCellsNeeded: [
    [0, 1],
    [0, 2],
    [0, -2],
  ],
  operationPosition: [0, 2],
  outputPosition: [0, -2],
  cost: 300,
  materialStorage: 0,
  // Room for two of the shop-built jigs at once — there are more sleds to
  // build than the saw can wear, so which two are mounted matters
  toolSlots: 2,
  // One board on the table at a time. What's on it decides the cut — an
  // edge-jointed board rips against the fence, a rough one rides the
  // straight-line sled, a panel goes on the crosscut sled. The fence
  // position (targetWidth) is the machine's one setting.
  inputSpaces: 1,
  directFeed: true,
  feedsThrough: true,
  // Small enough to mount on a worktable cell instead of the floor
  benchtop: true,
  powerSwitch: true,
  corded: true,
  operations: [
    {
      id: "ripBoard",
      requiredSkill: "basicMilling",
      name: "Rip Board",
      // A rip wants the board lying flat on the table, which is how the
      // saw rests — R stands the work on edge for the resaw below.
      stockOrientation: "flat",
      duration: 15,
      dustOutput: 1.6,
      parameters: [
        stockOrientationParameter("flat"),
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
      explainRejection: (material, params) => {
        if (!isBoard(material)) {
          return null;
        }
        if (material.jointedEdges === 0) {
          return "A rough edge can't ride the fence — that's kickback. Joint an edge first, or straight-line it on a sled.";
        }
        const fence = params?.targetWidth as number;
        if (material.width <= fence) {
          return `The fence is set to ${fence}" — the stock is no wider than that. Move the fence in to rip it.`;
        }
        return null;
      },
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
    },
    {
      id: "resawOnTableSaw",
      name: "Resaw",
      requiredSkill: "resawing",
      // Stand the board on edge against the fence and split it in two.
      // It's the table saw's way into resawing — cheaper than a band saw,
      // and worse at it: the blade takes a quarter-inch of the board away
      // as dust, and the two passes have to meet in the middle, which
      // caps how wide a board it can split. What it gives back is the cut
      // itself — a rip blade leaves a cleaner face than a band saw blade
      // does, so a smooth board resawn here stays smooth.
      stockOrientation: "on edge",
      // Two passes and a flip, and you're feeding it by hand the whole way.
      duration: 25,
      dustOutput: 2.4,
      parameters: [
        stockOrientationParameter("flat"),
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
    {
      id: "ripSheet",
      requiredSkill: "basicMilling",
      name: "Rip Sheet",
      // Flat on the table, same as a board rip — a sheet has no edge to
      // stand on. The two stay disjoint because their stock does.
      stockOrientation: "flat",
      duration: 18,
      // Sheet goods are dustier than lumber: no grain, all binder.
      dustOutput: 2.2,
      parameters: [
        stockOrientationParameter("flat"),
        {
          id: "sheetRipWidth",
          name: "Fence",
          values: SHEET_FENCE_WIDTHS,
          defaultValue: 24,
        },
      ],
      getInputMaterials: (params) => {
        const fence = params.sheetRipWidth as number;
        return [
          {
            type: ["plywood"],
            quantity: 1,
            // Sheet widths are plain inches off a saw, not detents, so
            // there's no allowed-value list to write here.
            matches: (material) =>
              isSheetGood(material) && material.width > fence,
            matchesNote: `wider than the ${fence}" fence`,
          },
        ];
      },
      explainRejection: (material, params) => {
        if (!isSheetGood(material)) {
          return null;
        }
        const fence = params?.sheetRipWidth as number;
        if (material.width <= fence) {
          return `The fence is set to ${fence}" and the sheet is no wider. Move the fence in, or turn the sheet and rip its length.`;
        }
        return null;
      },
      output: (materials, params) => {
        const sheet = materials[0];
        if (!isSheetGood(sheet)) {
          throw new Error("Input material is not a sheet good");
        }
        return cutSheet(sheet, params.sheetRipWidth as number, "width");
      },
    },
  ],
};
