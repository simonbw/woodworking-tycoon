import { MachineType, ParameterizedOperation } from "../Machine";
import {
  BOARD_DIMENSIONS,
  BoardDimension,
  SignedMiterAngle,
} from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";
import { GENERATED_COLLISION_BOXES } from "../machine-collision-boxes.generated";

/**
 * The saw's detents — the head swings both ways off square, like the real
 * detent plate, because mirrored cuts are how a frame rail's two ends get
 * made without flipping the stock. 0° is a plain crosscut.
 */
export const SAW_ANGLE_STOPS = [
  -45, -30, -22.5, 0, 22.5, 30, 45,
] as const;

/**
 * Where along the stock the blade can land, measured in feet from the
 * board's left end — you slide the board under the blade to a foot mark,
 * you don't dial in "how long the kept piece is". A cut needs wood on both
 * sides of the line, so the marks stop one foot shy of the longest board.
 */
export const CUT_POSITIONS = BOARD_DIMENSIONS.filter(
  (d) => d < BOARD_DIMENSIONS[BOARD_DIMENSIONS.length - 1],
);

export const miterSaw: MachineType = {
  id: "miterSaw",
  name: "Miter Saw",
  description: "A portable saw for cross cutting wood, square or at an angle.",
  cellsOccupied: [[0, 0]],
  collisionBox: GENERATED_COLLISION_BOXES.miterSaw,
  freeCellsNeeded: [],
  operationPosition: [0, 1],
  cost: 150,
  materialStorage: 0,
  toolSlots: 1,
  // Direct feed, trigger-style: set the head to an angle stop, hold the
  // carried board against the fence, pull the trigger. Nothing is "loaded";
  // the cut pieces stay on the saw table until collected.
  inputSpaces: 0,
  directFeed: true,
  feedVerb: "Cut",
  // Small enough to mount on a worktable cell instead of the floor
  benchtop: true,
  operations: [
    {
      id: "cutBoard",
      requiredSkill: "basicMilling",
      name: "Cut Board",
      duration: 15,
      dustOutput: 1,
      // Set up the saw, don't pick a recipe: swing the blade to an angle
      // stop and slide the stock under it — the cut line's position along
      // the board decides both pieces' lengths at once.
      parameters: [
        {
          id: "cutPosition",
          name: "Cut Line",
          values: CUT_POSITIONS,
          // Fresh out of the crate the stock sits mid-table
          defaultValue: 4,
          unit: "'",
          presentation: "slide",
        },
        {
          id: "angle",
          name: "Angle",
          values: SAW_ANGLE_STOPS,
          // The head rests square, mid-swing
          defaultValue: 0,
          unit: "°",
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          // The blade must land inside the board — wood on both sides
          length: BOARD_DIMENSIONS.filter(
            (d) => d > (params.cutPosition as BoardDimension),
          ),
          quantity: 1,
        },
      ],
      explainRejection: (material, params) => {
        if (!isBoard(material)) {
          return null;
        }
        const line = params?.cutPosition as number;
        if (material.length <= line) {
          // The wood isn't wrong, the setting is — say so
          return `The ${line}' mark is past the end of this board — slide the cut line inside it.`;
        }
        return null;
      },
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        // The cut line sits cutPosition feet from the left end, so the
        // left piece is that long and its fresh face is its right end.
        return cutBoard(
          inputBoard,
          params.cutPosition as BoardDimension,
          "length",
          0,
          {
            angle: (params.angle as SignedMiterAngle | 0) ?? 0,
            cutEnd: "right",
          },
        );
      },
    } as ParameterizedOperation,
  ],
};
