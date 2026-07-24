import {
  FinishedProduct,
  MaterialInstance,
  REAL_WOOD_SPECIES,
} from "../Materials";
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
    {
      name: "Build Step Stool",
      id: "buildStepStool",
      requiredSkill: "rusticCarpentry",
      duration: 30,
      // It has to hold a person, so every joint gets a screw
      requiredConsumables: [{ id: "screws", amount: 10 }],
      inputMaterials: [
        // Two stout sides — crosscut stringers or thick hardwood
        {
          type: ["board"],
          width: [6],
          length: [2],
          thickness: [3, 4],
          quantity: 2,
        },
        // Two treads of thinner stock
        {
          type: ["board"],
          width: [4],
          length: [2],
          thickness: [1, 2],
          quantity: 2,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const boards = materials.filter((m) => m.type === "board");
        if (boards.length !== 4) {
          throw new Error("Need exactly 4 boards to build a step stool");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "stepStool",
              species: boards[0].species,
            }),
          ],
        };
      },
    },
    {
      name: "Build Bookshelf",
      id: "buildBookshelf",
      requiredSkill: "fineShelving",
      duration: 40,
      requiredConsumables: [{ id: "screws", amount: 12 }],
      inputMaterials: [
        // Twice the stock of a single shelf: two shelves, two sides
        {
          type: ["board"],
          species: REAL_WOOD_SPECIES,
          length: [4],
          width: [6],
          thickness: [4],
          surface: ["sanded"],
          quantity: 4,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const boards = materials.filter((m) => m.type === "board");
        if (boards.length !== 4) {
          throw new Error("Need exactly 4 boards to build a bookshelf");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "bookshelf",
              species: boards[0].species,
            }),
          ],
        };
      },
    },
  ],
};
