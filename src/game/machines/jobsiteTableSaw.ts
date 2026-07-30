import { MachineType } from "../Machine";
import { BOARD_DIMENSIONS, BoardDimension } from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";
import { GENERATED_COLLISION_SHAPES } from "../machine-collision-boxes.generated";

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
  ],
};
