import { MachineType } from "../Machine";
import { SignedMiterAngle } from "../Materials";
import { cutBoard, isBoard } from "../board-helpers";
import { GENERATED_COLLISION_SHAPES } from "../machine-collision-boxes.generated";
import { formatLength } from "../../utils/formatNumber";

/**
 * The saw's detents — the head swings both ways off square, like the real
 * detent plate, because mirrored cuts are how a frame rail's two ends get
 * made without flipping the stock. 0° is a plain crosscut.
 */
export const SAW_ANGLE_STOPS = [-45, -30, -22.5, 0, 22.5, 30, 45] as const;

/**
 * Where along the stock the blade can land, in inches from the board's
 * left end — you slide the board under the blade to a mark, you don't
 * dial in "how long the kept piece is". The detents sit every half foot:
 * fine enough for short work (a birdhouse's 6" sides come off one 12"
 * crosscut, halved), coarse enough that the scale still reads at a
 * glance. A cut needs wood on both sides of the line, so the marks stop
 * short of the longest board.
 */
export const CUT_POSITIONS = Array.from(
  { length: 15 },
  (_, i) => (i + 1) * 6,
) as ReadonlyArray<number>;

export const miterSaw: MachineType = {
  id: "miterSaw",
  name: "Miter Saw",
  description:
    "A portable crosscut saw. Cuts boards to length, square or at an angle.",
  // A miter saw is wide (28" across the fence wings) and shallow: a
  // 3×2-ft footprint, with the handle overhanging the operator side (see
  // the measured collision box).
  cellsOccupied: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  collisionShapes: GENERATED_COLLISION_SHAPES.miterSaw,
  freeCellsNeeded: [
    [0, 1],
    [0, 2],
  ],
  operationPosition: [0, 2],
  cost: 150,
  materialStorage: 0,
  toolSlots: 1,
  // One board on the table at a time: you set it against the fence (F),
  // slide it to the mark, then pull the trigger (hold Space). The cut
  // pieces stay on the saw table until collected.
  inputSpaces: 1,
  directFeed: true,
  corded: true,
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
          defaultValue: 48,
          unit: '"',
          presentation: "slide",
        },
        {
          id: "angle",
          name: "Angle",
          values: SAW_ANGLE_STOPS,
          // The head rests square, mid-swing
          defaultValue: 0,
          unit: "°",
          // You swing the head, you don't slide it — so it's R's setting,
          // leaving Z/X for the cut line.
          presentation: "rotate",
        },
      ],
      getInputMaterials: (params) => [
        {
          type: ["board"],
          // The blade must land inside the board — wood on both sides.
          // A ">" can't be an allowed-values array now that lengths are
          // open inches, so it's the predicate escape hatch (recipe
          // constant — never serialized).
          matches: (material) =>
            isBoard(material) &&
            material.length > (params.cutPosition as number),
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
          return `The ${formatLength(line)} mark is past the end of this board — slide the cut line inside it.`;
        }
        return null;
      },
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        // The cut line sits cutPosition inches from the left end, so the
        // left piece is that long and its fresh face is its right end.
        return cutBoard(inputBoard, params.cutPosition as number, "length", 0, {
          angle: (params.angle as SignedMiterAngle | 0) ?? 0,
          cutEnd: "right",
        });
      },
    },
  ],
};
