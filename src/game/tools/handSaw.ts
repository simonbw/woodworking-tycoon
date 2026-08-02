import {
  BOARD_DIMENSIONS,
  BoardDimension,
  SignedMiterAngle,
} from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";
import { SAW_ANGLE_STOPS } from "../machines/miterSaw";
import { ToolType } from "../Tool";

/**
 * The budget crosscut: a backsaw and a miter box, mountable at any bench.
 * Same cuts as the miter saw — the box's slots give it the same angle
 * stops — at sweat pace. Machines buy time; they don't gate products.
 */
export const handSaw: ToolType = {
  id: "handSaw",
  name: "Hand Saw",
  description:
    "A backsaw and a miter box. Crosscuts boards to length at the same angle stops as the miter saw, and takes about three times as long.",
  cost: 18,
  // A hand tool belongs on a bench, not clamped into a jointer's jig slot.
  compatibleMachines: [
    "workspace",
    "worktable1x1",
    "worktable1x2",
    "worktable1x3",
    "worktable2x2",
  ],
  operations: [
    {
      id: "handSawCut",
      requiredSkill: "basicMilling",
      name: "Cut Board by Hand",
      duration: 40,
      // Mark the line, then push-pull strokes deepen the kerf — the
      // budget scales with the stock's cross-section
      interaction: { kind: "saw", kerfPerSecond: 0.25 },
      dustOutput: 0.3,
      // The same setup the miter saw models: drop the saw into an angle
      // slot, choose which end faces the blade, measure off the kept length.
      parameters: [
        {
          id: "angle",
          name: "Angle",
          values: SAW_ANGLE_STOPS,
          // The head rests square, mid-swing
          defaultValue: 0,
          unit: "°",
        },
        {
          id: "cutEnd",
          name: "Cut End",
          values: ["left", "right"],
          unit: "",
        },
        {
          id: "targetLength",
          name: "Target Length",
          values: BOARD_DIMENSIONS,
          unit: "'",
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          length: BOARD_DIMENSIONS.filter(
            (d) => d > (params.targetLength as BoardDimension),
          ),
          quantity: 1,
        },
      ],
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        return cutBoard(
          inputBoard,
          params.targetLength as BoardDimension,
          "length",
          0,
          {
            angle: (params.angle as SignedMiterAngle | 0) ?? 0,
            cutEnd: (params.cutEnd as "left" | "right") ?? "left",
          },
        );
      },
    },
  ],
};
