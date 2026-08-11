import { MaterialInstance } from "../Materials";
import {
  assembleFromBlueprint,
  blueprintFastenerCost,
  blueprintInputs,
  BOOKSHELF_BLUEPRINT,
  PLANTER_BOX_BLUEPRINT,
  STEP_STOOL_BLUEPRINT,
} from "../bench-work/blueprint";
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
    "A cordless drill/driver. Screwed assembly is only available at a station with one mounted.",
  cost: 70,
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
      name: "Build Rustic Planter Box",
      id: "buildPlanterBox",
      requiredSkill: "rusticProjects",
      duration: 25,
      // Screws hold an outdoor box together through wet soil and weather
      // where nails would work loose — and unlike nails, they never come
      // back as pallet salvage, so this is the screw economy's anchor.
      // The recipe reads off the blueprint: 2' crosscuts — the first
      // rustic build that needs a saw before the assembly starts — one
      // bottom slat and four walls stood on edge.
      interaction: { kind: "assembly", blueprint: "planterBox" },
      requiredConsumables: blueprintFastenerCost(PLANTER_BOX_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(PLANTER_BOX_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(PLANTER_BOX_BLUEPRINT, materials)],
      }),
    },
    {
      name: "Build Step Stool",
      id: "buildStepStool",
      requiredSkill: "rusticProjects",
      duration: 30,
      // The blueprint: two stout sides on edge (thick hardwood, 6/4 or
      // heavier), two treads screwed flat across them — it has
      // to hold a person, so every joint takes a screw, not a nail.
      interaction: { kind: "assembly", blueprint: "stepStool" },
      requiredConsumables: blueprintFastenerCost(STEP_STOOL_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(STEP_STOOL_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(STEP_STOOL_BLUEPRINT, materials)],
      }),
    },
    {
      name: "Build Bookshelf",
      id: "buildBookshelf",
      requiredSkill: "fineShelving",
      duration: 40,
      // Twice the single shelf's stock: two sides up on edge, two
      // shelves across them — the first blueprint built from sanded
      // hardwood, so the grain the player surfaced is the grain on
      // the floor.
      interaction: { kind: "assembly", blueprint: "bookshelf" },
      requiredConsumables: blueprintFastenerCost(BOOKSHELF_BLUEPRINT),
      getInputMaterials: () => blueprintInputs(BOOKSHELF_BLUEPRINT),
      output: (materials: ReadonlyArray<MaterialInstance>) => ({
        inputs: [],
        outputs: [assembleFromBlueprint(BOOKSHELF_BLUEPRINT, materials)],
      }),
    },
  ],
};
