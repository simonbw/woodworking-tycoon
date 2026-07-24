import { ToolType } from "../Tool";
import { makeMaterial } from "../material-helpers";
import { Board, FinishedProduct, MaterialInstance } from "../Materials";

/**
 * The starter tool: every new shop opens with one mounted on the workspace.
 * Nailed joinery lives here — recipes that need a hammer are hammer
 * operations, so a station without one simply can't offer them.
 */
export const hammer: ToolType = {
  id: "hammer",
  name: "Hammer",
  description:
    "Sixteen ounces of persuasion. Nailed joinery needs one at the bench.",
  cost: 12,
  operations: [
    {
      name: "Build Rustic Pallet Shelf",
      id: "buildRusticPalletShelf",
      requiredSkill: "rusticCarpentry",
      duration: 30,
      // The wood is free if you pried it off a pallet — and so are the
      // nails, which come back out with the boards (see dismantlePallet)
      requiredConsumables: [{ id: "nails", amount: 8 }],
      inputMaterials: [
        {
          type: ["board"],
          species: ["pallet"],
          width: [6],
          length: [4],
          quantity: 2,
        }, // stringers as shelves
        {
          type: ["board"],
          species: ["pallet"],
          width: [4],
          length: [3],
          quantity: 3,
        }, // deck boards as back support
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        // Validate inputs
        const boards = materials.filter(
          (m: MaterialInstance): m is Board => m.type === "board",
        );
        if (boards.length !== 5) {
          throw new Error("Need exactly 5 boards to build a rustic shelf");
        }

        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "rusticShelf",
              species: "pallet",
            }),
          ],
        };
      },
    },
    {
      name: "Build Birdhouse",
      id: "buildBirdhouse",
      requiredSkill: "rusticCarpentry",
      duration: 20,
      requiredConsumables: [{ id: "nails", amount: 6 }],
      inputMaterials: [
        // Short deck-board crosscuts: walls, floor, and a pitched roof
        {
          type: ["board"],
          width: [4],
          length: [1],
          thickness: [1],
          quantity: 4,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const boards = materials.filter(
          (m: MaterialInstance): m is Board => m.type === "board",
        );
        if (boards.length !== 4) {
          throw new Error("Need exactly 4 boards to build a birdhouse");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "birdhouse",
              species: boards[0].species,
            }),
          ],
        };
      },
    },
    {
      name: "Build Crate",
      id: "buildCrate",
      requiredSkill: "rusticCarpentry",
      duration: 25,
      requiredConsumables: [{ id: "nails", amount: 12 }],
      inputMaterials: [
        // Six whole deck boards: slatted sides and a bottom
        {
          type: ["board"],
          width: [4],
          length: [3],
          thickness: [1],
          quantity: 6,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const boards = materials.filter(
          (m: MaterialInstance): m is Board => m.type === "board",
        );
        if (boards.length !== 6) {
          throw new Error("Need exactly 6 boards to build a crate");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "crate",
              species: boards[0].species,
            }),
          ],
        };
      },
    },
  ],
};
