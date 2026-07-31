import { MachineType, stockOrientationParameter } from "../Machine";
import { BOARD_DIMENSIONS, Board, BoardDimension } from "../Materials";
import { cutBoard, isBoard, resawBoard } from "../board-helpers";
import { GENERATED_COLLISION_SHAPES } from "../machine-collision-boxes.generated";
import { makeMaterial } from "../material-helpers";

/**
 * How wide a board this saw can stand on edge under its guides. A 14"
 * machine clears more than the widest board in the shop, so nothing gets
 * turned away — the narrow benchtop tier is where this number bites.
 */
export const BAND_SAW_RESAW_CAPACITY = 8;

/**
 * The 14" band saw: two big wheels, a thin blade, and a fence. Two cuts
 * live here, told apart by how the stock sits on the table — press R to
 * turn it over:
 *
 * - **Resaw**, the stock standing on edge: splitting a board along its
 *   thickness so the wood that would have become planer shavings comes
 *   off as a second board instead. The blade is thin enough that the kerf
 *   disappears at quarter-inch granularity: a 8/4 blank really does make
 *   two 4/4 boards. No reference face required — the fence rides whatever
 *   the board offers, and the pieces come away no better referenced than
 *   the board went in.
 * - **Rip**, the stock lying flat: cutting to width. A band saw can't
 *   kick back, so even a rough edge can ride the fence — the price is the
 *   cut itself, which comes off the blade too rough to count as a
 *   straight edge.
 *
 * Curves, the other half of what a band saw is for, wait on a
 * shaped-parts system.
 */
export const bandSaw: MachineType = {
  id: "bandSaw",
  name: "Band Saw",
  description:
    "Resaws a board on edge into two thinner boards, or rips one lying " +
    "flat — rough edges welcome. R turns the stock over.",
  // A 14" saw on its stand: a tall column over a roughly 2×2-ft footprint.
  cellsOccupied: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  collisionShapes: GENERATED_COLLISION_SHAPES.bandSaw,
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
  feedsThrough: true,
  powerSwitch: true,
  corded: true,
  operations: [
    {
      id: "resaw",
      requiredSkill: "basicMilling",
      name: "Resaw",
      // The saw's headline cut: stock rests on edge by default, so old
      // saves that predate the setting keep resawing.
      stockOrientation: "on edge",
      // Slow going: a band saw resaws at a walking pace and the cut is
      // the full width of the board.
      duration: 20,
      dustOutput: 2,
      parameters: [
        stockOrientationParameter("on edge"),
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
            quantity: 1,
          },
        ];
      },
      explainRejection: (material, params) => {
        if (!isBoard(material)) {
          return null;
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
    {
      id: "ripBoard",
      requiredSkill: "basicMilling",
      name: "Rip Board",
      // Lay the stock flat (R) and the same fence rips to width.
      stockOrientation: "flat",
      // Slower than the table saw — but look what it puts up with.
      duration: 18,
      dustOutput: 1.2,
      parameters: [
        stockOrientationParameter("on edge"),
        {
          id: "targetWidth",
          name: "Fence",
          values: BOARD_DIMENSIONS,
          defaultValue: 4,
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          width: BOARD_DIMENSIONS.filter(
            (d) => d > (params.targetWidth as BoardDimension),
          ),
          // No jointed edge demanded: a band saw can't kick back, so a
          // rough edge rides the fence just fine.
          quantity: 1,
        },
      ],
      explainRejection: (material, params) => {
        if (!isBoard(material)) {
          return null;
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
        const { outputs } = cutBoard(
          inputBoard,
          params.targetWidth as BoardDimension,
          "width",
        );
        const [fenceSide, offcut] = outputs as ReadonlyArray<Board>;
        // Both fresh sawn edges come off too rough to reference: the
        // fence-side piece keeps only the edge that rode the fence, the
        // offcut only its far one — each straight only if the input's was
        // (the mirror of resawBoard's faces).
        return {
          inputs: [],
          outputs: [
            makeMaterial<Board>({
              ...fenceSide,
              jointedEdges: Math.min(inputBoard.jointedEdges, 1) as 0 | 1,
            }),
            ...(offcut
              ? [
                  makeMaterial<Board>({
                    ...offcut,
                    jointedEdges: (inputBoard.jointedEdges === 2 ? 1 : 0) as
                      0 | 1,
                  }),
                ]
              : []),
          ],
        };
      },
    },
  ],
};
