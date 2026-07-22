import { BOARD_DIMENSIONS, Board, BoardDimension, Panel } from "../Materials";
import { isBoard } from "../board-helpers";
import { isPanel } from "../panel-helpers";
import { makeMaterial } from "../material-helpers";
import { MachineType, ParameterizedOperation } from "../Machine";
import { GENERATED_COLLISION_BOXES } from "../machine-collision-boxes.generated";

/** The next detent up the thickness scale, or undefined at the top. */
export function thicknessStepAbove(
  dimension: BoardDimension,
): BoardDimension | undefined {
  return BOARD_DIMENSIONS[BOARD_DIMENSIONS.indexOf(dimension) + 1];
}

/** The next detent down the thickness scale, or undefined at the bottom. */
export function thicknessStepBelow(
  dimension: BoardDimension,
): BoardDimension | undefined {
  return BOARD_DIMENSIONS[BOARD_DIMENSIONS.indexOf(dimension) - 1];
}

/**
 * The planer has no modes — like the real thing, its whole interface is a
 * power switch, a height crank, and stock fed in from your hands. One
 * operation covers boards and panels alike (the cutter head can't tell),
 * and each pass takes at most one thickness detent off: deeper cuts mean
 * sequential passes, cranking the head down between each.
 */
export const lunchboxPlaner: MachineType = {
  id: "planer",
  name: "Planer",
  description: "A lunchbox planer",
  cellsOccupied: [[0, 0]],
  collisionBox: GENERATED_COLLISION_BOXES.lunchboxPlaner,
  // Feed-through: room to stand at the infeed and to catch stock at the
  // outfeed — a planer can't back onto a wall
  freeCellsNeeded: [
    [0, 1],
    [0, -1],
  ],
  operationPosition: [0, 1],
  outputPosition: [0, -1],
  cost: 450,
  materialStorage: 0,
  toolSlots: 1,
  // Stock feeds straight from the player's hands — no staged input bay
  inputSpaces: 0,
  directFeed: true,
  // Small enough to mount on a worktable cell instead of the floor
  benchtop: true,
  powerSwitch: true,
  operations: [
    {
      id: "plane",
      requiredSkill: "basicMilling",
      name: "Plane",
      duration: 8,
      dustOutput: 4,
      // Feed rollers pull the board through on their own — once it's in,
      // the pass finishes whether or not anyone is standing there
      powerFeed: true,
      parameters: [
        {
          id: "targetThickness",
          name: "Cut Height",
          values: BOARD_DIMENSIONS,
          unit: "/4",
        },
      ],
      getInputMaterials: (params) => {
        const cutHeight = params.targetThickness as BoardDimension;
        // Equal thickness is a skim pass: rough stock carries sacrificial
        // material beyond its nominal size, so milling never shrinks the
        // listed dimensions. One detent above is a full-depth bite; any
        // thicker won't fit under the cutter head at this setting.
        const above = thicknessStepAbove(cutHeight);
        return [
          {
            type: ["board", "panel"],
            thickness: above === undefined ? [cutHeight] : [cutHeight, above],
            quantity: 1,
            matches: (material) =>
              isBoard(material)
                ? // A planer needs a flat reference face — it can't fix warp,
                  // only copy flatness to the other side. Joint a face first.
                  material.jointedFaces >= 1
                : // Never feed end grain into a planer — it tears out in
                  // chunks. Sanding is the only way to flatten an end-grain
                  // panel.
                  isPanel(material) && material.grain !== "end",
          },
        ];
      },
      explainRejection: (material, params) => {
        // The workflow prerequisite comes first: thickness only matters
        // once the stock has a face to ride the bed on
        if (isBoard(material) && material.jointedFaces === 0) {
          return "No flat reference face — a planer copies flatness to the far side, it can't create it. Joint a face first.";
        }
        if (isPanel(material) && material.grain === "end") {
          return "End grain tears out under a cutter head — an end-grain panel gets flattened by sanding instead.";
        }
        if (!isBoard(material) && !isPanel(material)) {
          return null;
        }
        const cutHeight = params?.targetThickness as BoardDimension;
        const bite = thicknessStepAbove(cutHeight);
        if (bite !== undefined && material.thickness > bite) {
          return `Won't fit under the cutter head — raise the cut height to ${thicknessStepBelow(material.thickness)}/4 for the first pass.`;
        }
        if (material.thickness < cutHeight) {
          return `The cutter head is set above the stock — lower the cut height to ${material.thickness}/4 to surface it.`;
        }
        return null;
      },
      output: (materials, params) => {
        const stock = materials[0];
        if (!isBoard(stock) && !isPanel(stock)) {
          throw new Error("Input material is not a board or panel");
        }
        const cutHeight = params.targetThickness as BoardDimension;
        // One detent per pass, never more. Equal thickness is a skim: same
        // size out, freshly surfaced.
        const planedThickness =
          stock.thickness > cutHeight
            ? (thicknessStepBelow(stock.thickness) ?? stock.thickness)
            : stock.thickness;
        // Freshly surfaced either way (but only sanding reaches "sanded");
        // a board's faces additionally come out parallel.
        return {
          inputs: [],
          outputs: [
            isBoard(stock)
              ? makeMaterial<Board>({
                  ...stock,
                  thickness: planedThickness,
                  jointedFaces: 2,
                  surface: "smooth",
                })
              : makeMaterial<Panel>({
                  ...stock,
                  thickness: planedThickness,
                  surface: "smooth",
                }),
          ],
        };
      },
    } as ParameterizedOperation,
  ],
};
