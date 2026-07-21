import { FinishedProduct, MaterialInstance } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { ToolType } from "../Tool";

/**
 * Screwed assembly's home. Like nailed joinery and the hammer, recipes
 * that need a drill are drill operations — a station without one can't
 * offer them. The planter box is the first; more screw-assembly recipes
 * hang off this tool as they land.
 */
export const drill: ToolType = {
  id: "drill",
  name: "Drill",
  description:
    "A cordless driver. Screwed assembly happens at whatever bench it's mounted on.",
  cost: 70,
  operations: [
    {
      name: "Build Rustic Planter Box",
      id: "buildPlanterBox",
      requiredSkill: "rusticCarpentry",
      duration: 25,
      // Screws hold an outdoor box together through wet soil and weather
      // where nails would work loose — and unlike nails, they never come
      // back as pallet salvage, so this is the screw economy's anchor.
      requiredConsumables: [{ id: "screws", amount: 8 }],
      inputMaterials: [
        // Deck boards crosscut to 2' — four sides and a bottom slat. The
        // first rustic build that needs a saw before the assembly starts.
        {
          type: ["board"],
          species: ["pallet"],
          width: [4],
          length: [2],
          thickness: [1],
          quantity: 5,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const boards = materials.filter((m) => m.type === "board");
        if (boards.length !== 5) {
          throw new Error("Need exactly 5 boards to build a planter box");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "planterBox",
              species: "pallet",
            }),
          ],
        };
      },
    },
  ],
};
