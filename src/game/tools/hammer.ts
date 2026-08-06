import { ToolType } from "../Tool";
import { MaterialInstance } from "../Materials";
import {
  assembleFromBlueprint,
  BIRDHOUSE_BLUEPRINT,
  blueprintFastenerCost,
  blueprintInputs,
  CRATE_BLUEPRINT,
  RUSTIC_FRAME_BLUEPRINT,
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
      name: "Build Rustic Frame",
      id: "buildRusticFrame",
      requiredSkill: "rusticCarpentry",
      duration: 25,
      // No skill of its own to buy: the gate is the shop. Mirrored 45s
      // need the miter saw's angle stops, 2"-wide rails need the table
      // saw's fence, and the sanded requirement needs something to sand
      // with — the first build that asks for all three at once.
      interaction: { kind: "assembly", blueprint: "rusticFrame" },
      requiredConsumables: blueprintFastenerCost(RUSTIC_FRAME_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(RUSTIC_FRAME_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(RUSTIC_FRAME_BLUEPRINT, materials)],
      }),
    },
    {
      name: "Build Birdhouse",
      id: "buildBirdhouse",
      requiredSkill: "rusticProjects",
      duration: 25,
      // A lean-to wren house, all off the blueprint: two tall front
      // boards with mitered tops (the first recipe that sends the player
      // to the saw's angle stops), short sides, a perch floor, and a
      // stringer crosscut laid flat over the slope as the roof.
      interaction: { kind: "assembly", blueprint: "birdhouse" },
      requiredConsumables: blueprintFastenerCost(BIRDHOUSE_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(BIRDHOUSE_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(BIRDHOUSE_BLUEPRINT, materials)],
      }),
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
