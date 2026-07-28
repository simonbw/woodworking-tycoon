import { MachineType } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { isBoard, resawBoard } from "../board-helpers";
import { GENERATED_COLLISION_BOXES } from "../machine-collision-boxes.generated";

/**
 * How wide a board this saw can stand on edge under its guides. A 14"
 * machine clears more than the widest board in the shop, so nothing gets
 * turned away — the narrow benchtop tier is where this number bites.
 */
export const BAND_SAW_RESAW_CAPACITY = 8;

/**
 * The 14" band saw: two big wheels, a thin blade, and a fence. Its whole
 * job here is resawing — splitting a board along its thickness so the wood
 * that would have become planer shavings comes off as a second board
 * instead. The blade is thin enough that the kerf disappears at
 * quarter-inch granularity: a 8/4 blank really does make two 4/4 boards.
 *
 * The cut faces come off rough — a band saw leaves blade marks, so both
 * halves want the planer or the sander afterwards. Curves, the other half
 * of what a band saw is for, wait on a shaped-parts system.
 */
export const bandSaw: MachineType = {
  id: "bandSaw",
  name: "Band Saw",
  description:
    "Resaws a board along its thickness, producing two thinner boards.",
  // A 14" saw on its stand: a tall column over a roughly 2×2-ft footprint.
  cellsOccupied: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  collisionBox: GENERATED_COLLISION_BOXES.bandSaw,
  // Stand at the front and push; a long board still needs somewhere to go
  // behind the blade, so this one can't back onto a wall either.
  freeCellsNeeded: [
    [0, 2],
    [1, 2],
    [0, -1],
    [1, -1],
  ],
  operationPosition: [0, 2],
  cost: 700,
  materialStorage: 0,
  // Room for a dust bag; the port is right under the table.
  toolSlots: 1,
  // One board against the fence at a time. Both halves stay on the table
  // when the cut finishes — you were holding them.
  inputSpaces: 1,
  directFeed: true,
  powerSwitch: true,
  operations: [
    {
      id: "resaw",
      requiredSkill: "basicMilling",
      name: "Resaw",
      // Slow going: a band saw resaws at a walking pace and the cut is
      // the full width of the board.
      duration: 20,
      dustOutput: 2,
      parameters: [
        {
          id: "targetThickness",
          name: "Fence",
          values: BOARD_DIMENSIONS,
          // The common split: a 4/4 board off a thicker blank.
          defaultValue: 4,
          unit: "/4",
        },
      ],
      getInputMaterials: (params) => {
        const fence = params.targetThickness as BoardDimension;
        return [
          {
            type: ["board"],
            // Anything thicker than the fence setting splits into two
            // pieces; at or under it there's nothing to take off.
            thickness: BOARD_DIMENSIONS.filter((d) => d > fence),
            width: BOARD_DIMENSIONS.filter((d) => d <= BAND_SAW_RESAW_CAPACITY),
            // The face against the fence has to be flat, or the two
            // halves come out wedge-shaped.
            jointedFaces: [1, 2],
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
        if (material.width > BAND_SAW_RESAW_CAPACITY) {
          return `Too wide to stand under the guides — this saw resaws up to ${BAND_SAW_RESAW_CAPACITY}".`;
        }
        const fence = params?.targetThickness as number;
        if (material.thickness <= fence) {
          return `The fence is set at ${fence}/4 — the stock is no thicker than that. Move the fence in to split it.`;
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
          // A thin blade at quarter-inch granularity takes nothing off
          // the scale, and leaves blade marks behind.
          { waste: 0, sawnSurface: "rough" },
        );
      },
    },
  ],
};
