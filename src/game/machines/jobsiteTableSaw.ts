import { MachineType } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";
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

/** The fence's detents for sheet work: every inch out to its capacity. */
const SHEET_FENCE_WIDTHS = Array.from(
  { length: RIP_FENCE_CAPACITY_IN - 1 },
  (_, index) => index + 2,
);

export const jobsiteTableSaw: MachineType = {
  id: "jobsiteTableSaw",
  name: "Jobsite Table Saw",
  description:
    "A portable table saw. Rips boards to width, and hosts shop-built sleds and the resaw fence.",
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
  // One jig at a time — the crosscut sled is the first
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
      // A rip wants the board lying flat on the table. Bare, the saw has
      // no other way to hold stock, so this never gates anything — it
      // starts mattering when the tall resaw fence is mounted and R can
      // stand the work on edge instead (see tools/resawFence.ts).
      stockOrientation: "flat",
      duration: 15,
      dustOutput: 1.6,
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
