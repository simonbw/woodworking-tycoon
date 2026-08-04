import { ToolType } from "../Tool";
import { makeMaterial } from "../material-helpers";
import { Board, FinishedProduct, MaterialInstance } from "../Materials";
import {
  assembleFromBlueprint,
  blueprintFastenerCost,
  blueprintInputs,
  CRATE_BLUEPRINT,
  RUSTIC_SHELF_BLUEPRINT,
} from "../bench-work/blueprint";

/**
 * The starter tool: every new shop opens with one mounted on the workspace.
 * Nailed joinery lives here — recipes that need a hammer are hammer
 * operations, so a station without one simply can't offer them.
 */
export const hammer: ToolType = {
  id: "hammer",
  name: "Hammer",
  description:
    "A 16 oz claw hammer. Nailed assembly is only available at a station with one mounted.",
  cost: 12,
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
      name: "Build Rustic Pallet Shelf",
      id: "buildRusticPalletShelf",
      requiredSkill: "rusticCarpentry",
      duration: 30,
      // The whole recipe reads off the blueprint — inputs (two stringers
      // as rails, three deck boards as shelves), the nail bill (one per
      // rail × shelf crossing), and the bench-view build itself. The
      // wood is free if you pried it off a pallet — and so are the
      // nails, which come back out with the boards (see dismantlePallet).
      interaction: { kind: "assembly", blueprint: "rusticShelf" },
      requiredConsumables: blueprintFastenerCost(RUSTIC_SHELF_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(RUSTIC_SHELF_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(RUSTIC_SHELF_BLUEPRINT, materials)],
      }),
    },
    {
      name: "Build Birdhouse",
      id: "buildBirdhouse",
      requiredSkill: "rusticProjects",
      duration: 20,
      interaction: { kind: "assembly" },
      requiredConsumables: [{ id: "nails", amount: 6 }],
      getInputMaterials: () => [
        // Short deck-board crosscuts: walls, floor, and a pitched roof
        {
          type: ["board"],
          width: [4],
          length: [12],
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
      requiredSkill: "rusticProjects",
      duration: 25,
      // The whole recipe reads off the blueprint, like the shelf: six
      // whole deck boards — two bottom slats, four walls stood on edge —
      // nailed at the lapped corners and the slat crossings.
      interaction: { kind: "assembly", blueprint: "crate" },
      requiredConsumables: blueprintFastenerCost(CRATE_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(CRATE_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(CRATE_BLUEPRINT, materials)],
      }),
    },
  ],
};
