import { array } from "../../utils/arrayUtils";
import {
  assembleFromBlueprint,
  blueprintFastenerCost,
  blueprintInputs,
  CROSSCUT_SLED_BLUEPRINT,
  HEX_FRAME_BLUEPRINT,
  MATERIAL_SHELF_BLUEPRINT,
  PICTURE_FRAME_BLUEPRINT,
  ProductBlueprint,
  RESAW_FENCE_BLUEPRINT,
  SERVING_TRAY_BLUEPRINT,
  SHELF_BLUEPRINT,
  SIDE_TABLE_BLUEPRINT,
  STORAGE_RACK_BLUEPRINT,
  STRAIGHT_LINE_SLED_BLUEPRINT,
  TOOL_DRAWERS_BLUEPRINT,
  WORKTABLE_BLUEPRINTS,
} from "../bench-work/blueprint";
import { board, isBoard, isMiteredFrameRail } from "../board-helpers";
import { Operation, OperationPhase } from "../Machine";
import { makeMaterial, makeToolItem } from "../material-helpers";
import {
  Pallet,
  EndGrainSlice,
  FinishedProduct,
  Board,
  JIG_GRADE_KINDS,
  MaterialInstance,
  Panel,
  panelWidth,
  RACK_GRADE_KINDS,
  REAL_WOOD_SPECIES,
  SHOP_FURNITURE_KINDS,
  Species,
} from "../Materials";
import { isPanel, panel } from "../panel-helpers";

// The sheet-grade vocabulary lives with the materials now (blueprints
// read it too); re-exported here for the recipes and tests that always
// imported it from the bench.
export {
  JIG_GRADE_KINDS,
  RACK_GRADE_KINDS,
  SHOP_FURNITURE_KINDS,
} from "../Materials";

/**
 * Every glue-up cures for the same long stretch once it's in the clamps —
 * the glue doesn't care how many strips you fed it. Curing is hands-free;
 * only the spread-and-clamp handwork differs per operation.
 */
export const GLUE_CURE_TICKS = 60;

/**
 * Clamps each glue-up ties up until it's cured (see Clamp.ts). The wider
 * the joint, the more bars it takes to pull it closed: a two-board pair
 * needs a clamp at each end, a five-strip panel wants one every few
 * inches, and marrying two finished panels is the widest joint the shop
 * makes. They're returned when the glue is cured, so this number is what
 * decides how many glue-ups can be curing at once — not what they cost.
 */
const PAIR_CLAMPS = 2;
const STRIP_CLAMPS = 3;
const PANEL_CLAMPS = 4;
const WIDE_PANEL_CLAMPS = 6;

function gluePhases(clampTicks: number): ReadonlyArray<OperationPhase> {
  return [
    { name: "Glue & Clamp", duration: clampTicks, attended: true },
    { name: "Curing", duration: GLUE_CURE_TICKS, attended: false },
  ];
}

/** The most common strip species in a panel (ties go to first appearance). */
function dominantSpecies(strips: ReadonlyArray<{ species: Species }>): Species {
  const counts = new Map<Species, number>();
  for (const strip of strips) {
    counts.set(strip.species, (counts.get(strip.species) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * The hand-work recipe list shared by every bench-style station: the
 * makeshift workbench you start with and the worktables you build. A
 * better bench doesn't know more recipes — it runs the attended work
 * faster (MachineType.workSpeed).
 */
export const BENCH_OPERATIONS: ReadonlyArray<Operation> = [
  {
    name: "Dismantle Pallet",
    id: "dismantlePallet",
    requiredSkill: "basicMilling",
    duration: 4,
    // Prying happens nail by nail through pryPalletNailAction — the
    // operation is never "run"; this output survives as the whole-teardown
    // shape the recipe promises (previews, and one pry-step per legacy run)
    interaction: { kind: "pry" },
    getInputMaterials: () => [{ type: ["pallet"], quantity: 1 }],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const inputPallet = materials[0];
      if (inputPallet.type !== "pallet") {
        throw new Error("Input material is not a pallet");
      }

      const deckBoardsCount = inputPallet.deckBoards.filter(
        (board: boolean) => board,
      ).length;
      // Every pried nail goes back into the shop's stock — one per
      // deck-board × stringer crossing (Pallet.nails). A whole pallet
      // worth of prying keeps the rustic shelf free.
      if (deckBoardsCount <= 1) {
        const stringerCount = inputPallet.stringers.filter(
          (present: boolean) => present,
        ).length;
        const stringers = array(stringerCount).map(() =>
          board("pallet", 48, 6, 6),
        );
        const deckBoards = array(deckBoardsCount).map(() =>
          board("pallet", 36, 4, 2),
        );
        return {
          inputs: [],
          outputs: [...stringers, ...deckBoards],
          consumableOutputs: [
            { id: "nails" as const, amount: inputPallet.nails.length },
          ],
        };
      } else {
        const deckBoardsLeft = [
          ...inputPallet.deckBoards,
        ] as typeof inputPallet.deckBoards;
        const index = deckBoardsLeft.findLastIndex(
          (board: boolean) => board === true,
        );
        deckBoardsLeft[index] = false;
        // The board comes off with all the nails that held it; with
        // deck boards still left, every stringer keeps at least one
        const nailsLeft = inputPallet.nails.filter((n) => n.deck !== index);
        return {
          inputs: [
            makeMaterial<Pallet>({
              ...inputPallet,
              deckBoards: deckBoardsLeft,
              nails: nailsLeft,
            }),
          ],
          outputs: [board("pallet", 36, 4, 2)],
          consumableOutputs: [
            {
              id: "nails" as const,
              amount: inputPallet.nails.length - nailsLeft.length,
            },
          ],
        };
      }
    },
  },
  {
    name: "Glue Up Panel",
    id: "glueUpPanel",
    requiredSkill: "panelWork",
    duration: 8 + GLUE_CURE_TICKS,
    phases: gluePhases(8),
    interaction: { kind: "glue" },
    requiredClamps: PANEL_CLAMPS,
    getInputMaterials: () => [
      {
        type: ["board"],
        width: [2],
        length: [24],
        thickness: [4],
        // Edge joints need straight edges, and clean faces make good
        // glue joints — rough stock won't do
        jointedEdges: [2],
        surface: ["smooth", "sanded"],
        quantity: 5,
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const strips = materials.filter(isBoard);
      if (strips.length !== 5) {
        throw new Error("Need exactly 5 strips to glue up a panel");
      }
      // Strip order is preserved, so multi-species glue-ups keep their
      // pattern — the recipe doesn't care, but future two-tone boards do.
      // Squeeze-out and alignment ridges mean the panel comes out rough.
      return {
        inputs: [],
        outputs: [
          panel(
            strips.map((strip) => ({
              species: strip.species,
              width: strip.width,
            })),
            strips[0].length,
            strips[0].thickness,
            "rough",
          ),
        ],
      };
    },
  },
  {
    name: "Glue Up Pair",
    id: "glueUpPair",
    requiredSkill: "freeformLamination",
    duration: 5 + GLUE_CURE_TICKS,
    phases: gluePhases(5),
    interaction: { kind: "glue" },
    requiredClamps: PAIR_CLAMPS,
    getInputMaterials: () => [
      {
        type: ["board"],
        length: [24],
        thickness: [4],
        jointedEdges: [2],
        surface: ["smooth", "sanded"],
        quantity: 2,
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const strips = materials.filter(isBoard);
      if (strips.length !== 2) {
        throw new Error("Need exactly 2 strips to glue up a pair");
      }
      return {
        inputs: [],
        outputs: [
          panel(
            strips.map((strip) => ({
              species: strip.species,
              width: strip.width,
            })),
            strips[0].length,
            strips[0].thickness,
            "rough",
          ),
        ],
      };
    },
  },
  {
    name: "Glue On Strip",
    id: "extendPanel",
    requiredSkill: "freeformLamination",
    duration: 5 + GLUE_CURE_TICKS,
    phases: gluePhases(5),
    interaction: { kind: "glue" },
    requiredClamps: STRIP_CLAMPS,
    getInputMaterials: () => [
      { type: ["panel"], length: [24], thickness: [4], quantity: 1 },
      {
        type: ["board"],
        length: [24],
        thickness: [4],
        jointedEdges: [2],
        surface: ["smooth", "sanded"],
        quantity: 1,
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const base = materials.find(isPanel);
      const strip = materials.find(isBoard);
      if (!base || !strip) {
        throw new Error("Glue On Strip needs a panel and a board");
      }
      // Fresh squeeze-out re-roughs the whole panel, so sand last
      return {
        inputs: [],
        outputs: [
          panel(
            [...base.strips, { species: strip.species, width: strip.width }],
            base.length,
            base.thickness,
            "rough",
          ),
        ],
      };
    },
  },
  {
    name: "Join Panels",
    id: "joinPanels",
    requiredSkill: "freeformLamination",
    duration: 8 + GLUE_CURE_TICKS,
    phases: gluePhases(8),
    interaction: { kind: "glue" },
    requiredClamps: WIDE_PANEL_CLAMPS,
    getInputMaterials: () => [
      { type: ["panel"], length: [24], thickness: [4], quantity: 2 },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const panels = materials.filter(isPanel);
      if (panels.length !== 2) {
        throw new Error("Need exactly 2 panels to join");
      }
      // How a real shop stages a wide glue-up: sub-panels first, then one
      // joint to marry them. Strip order: first panel, then the second.
      return {
        inputs: [],
        outputs: [
          panel(
            [...panels[0].strips, ...panels[1].strips],
            panels[0].length,
            panels[0].thickness,
            "rough",
          ),
        ],
      };
    },
  },
  {
    name: "Build Crosscut Sled",
    id: "buildCrosscutSled",
    requiredSkill: "jigsAndFixtures",
    duration: 40,
    // A flat sheet base plus scrap runners and a fence, laid out and
    // screwed on the bench scene like any blueprint build
    interaction: { kind: "assembly", blueprint: "crosscutSled" },
    requiredConsumables: blueprintFastenerCost(CROSSCUT_SLED_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(CROSSCUT_SLED_BLUEPRINT),
    output: () => {
      // The output is tooling, not product: the sled comes off the bench
      // a physical thing, to be carried to the table saw and mounted
      return {
        inputs: [],
        outputs: [makeToolItem("crosscutSled")],
      };
    },
  },
  {
    name: "Build Straight-Line Sled",
    id: "buildStraightLineSled",
    requiredSkill: "jigsAndFixtures",
    duration: 30,
    // A long flat base with a reference rail and clamp carrier; same
    // pallet-scrap ingredients as the crosscut sled
    interaction: { kind: "assembly", blueprint: "straightLineSled" },
    requiredConsumables: blueprintFastenerCost(STRAIGHT_LINE_SLED_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(STRAIGHT_LINE_SLED_BLUEPRINT),
    output: () => {
      return {
        inputs: [],
        outputs: [makeToolItem("straightLineSled")],
      };
    },
  },
  {
    name: "Build Tall Resaw Fence",
    id: "buildResawFence",
    requiredSkill: "resawing",
    duration: 25,
    // A tall sheet face and two triangular braces to keep it square to
    // the table — nothing rides, so it's the cheapest jig of the three
    interaction: { kind: "assembly", blueprint: "resawFence" },
    requiredConsumables: blueprintFastenerCost(RESAW_FENCE_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(RESAW_FENCE_BLUEPRINT),
    output: () => {
      return {
        inputs: [],
        outputs: [makeToolItem("resawFence")],
      };
    },
  },
  {
    name: "Glue Up End-Grain Panel",
    id: "glueUpEndGrain",
    requiredSkill: "endGrainBoards",
    duration: 8 + GLUE_CURE_TICKS,
    phases: gluePhases(8),
    interaction: { kind: "glue" },
    requiredClamps: PANEL_CLAMPS,
    getInputMaterials: () => [{ type: ["endGrainSlice"], quantity: 4 }],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const slices = materials.filter(
        (m): m is EndGrainSlice => m.type === "endGrainSlice",
      );
      if (slices.length !== 4) {
        throw new Error("Need exactly 4 slices for an end-grain glue-up");
      }
      // Stood on end and clamped: a short, thick blank showing the
      // source pattern as its face. 8/4 thick — butcher-block territory.
      return {
        inputs: [],
        outputs: [
          makeMaterial<Panel>({
            type: "panel",
            grain: "end",
            strips: slices[0].strips,
            length: 12,
            thickness: 8,
            surface: "rough",
          }),
        ],
      };
    },
  },
  {
    name: "Build Shelf",
    id: "buildShelf",
    requiredSkill: "fineShelving",
    duration: 35,
    // Plank face-down, cleat on edge along its back, screwed down the
    // length of the seam — the whole recipe reads off the blueprint
    interaction: { kind: "assembly", blueprint: "shelf" },
    requiredConsumables: blueprintFastenerCost(SHELF_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(SHELF_BLUEPRINT),
    output: (materials: ReadonlyArray<MaterialInstance>) => ({
      inputs: [],
      outputs: [assembleFromBlueprint(SHELF_BLUEPRINT, materials)],
    }),
  },
  {
    name: "Build Picture Frame",
    id: "buildPictureFrame",
    requiredSkill: "miteredFrames",
    duration: 30,
    // The whole recipe reads off the blueprint: four mirrored-miter
    // rails laid around the opening, one brad derived at each 1×1
    // corner lap — the nail economy's second consumer, still four.
    interaction: { kind: "assembly", blueprint: "pictureFrame" },
    requiredConsumables: blueprintFastenerCost(PICTURE_FRAME_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(PICTURE_FRAME_BLUEPRINT),
    output: (materials: ReadonlyArray<MaterialInstance>) => ({
      inputs: [],
      outputs: [assembleFromBlueprint(PICTURE_FRAME_BLUEPRINT, materials)],
    }),
  },
  {
    name: "Build Hex Frame",
    id: "buildHexFrame",
    requiredSkill: "polygonJoinery",
    duration: 35,
    // Six mitered rails around a hexagonal opening, bradded at the six
    // skewed corner laps — the whole recipe reads off the blueprint,
    // the first whose slots turn off the square grid
    interaction: { kind: "assembly", blueprint: "hexFrame" },
    requiredConsumables: blueprintFastenerCost(HEX_FRAME_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(HEX_FRAME_BLUEPRINT),
    output: (materials: ReadonlyArray<MaterialInstance>) => ({
      inputs: [],
      outputs: [assembleFromBlueprint(HEX_FRAME_BLUEPRINT, materials)],
    }),
  },
  {
    name: "Build Serving Tray",
    id: "buildServingTray",
    requiredSkill: "trayWork",
    duration: 35,
    // A six-strip panel bottom inside the picture frame's rail wrap:
    // two long rails screwed down the panel's edges, two short ends
    // bradded over the corners — the whole recipe reads off the
    // blueprint, panel part and all
    interaction: { kind: "assembly", blueprint: "servingTray" },
    requiredConsumables: blueprintFastenerCost(SERVING_TRAY_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(SERVING_TRAY_BLUEPRINT),
    output: (materials: ReadonlyArray<MaterialInstance>) => ({
      inputs: [],
      outputs: [assembleFromBlueprint(SERVING_TRAY_BLUEPRINT, materials)],
    }),
  },
  {
    name: "Build Side Table",
    id: "buildSideTable",
    requiredSkill: "furnitureBasics",
    duration: 60,
    // Built the way every table is: the glued top face-down, four legs
    // stood on their ends at its corners, screwed down through the
    // underside — the whole recipe reads off the blueprint
    interaction: { kind: "assembly", blueprint: "sideTable" },
    requiredConsumables: blueprintFastenerCost(SIDE_TABLE_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(SIDE_TABLE_BLUEPRINT),
    output: (materials: ReadonlyArray<MaterialInstance>) => ({
      inputs: [],
      outputs: [assembleFromBlueprint(SIDE_TABLE_BLUEPRINT, materials)],
    }),
  },
  {
    name: "Build Jewelry Box",
    id: "buildJewelryBox",
    requiredSkill: "boxJoinery",
    duration: 45,
    interaction: { kind: "assembly" },
    getInputMaterials: () => [
      {
        type: ["board"],
        species: REAL_WOOD_SPECIES,
        length: [24],
        width: [4],
        // Thin stock: you'll be planing for this
        thickness: [2],
        surface: ["sanded"],
        quantity: 4,
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const boards = materials.filter(isBoard);
      if (boards.length !== 4) {
        throw new Error("Need exactly 4 boards to build a jewelry box");
      }
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "jewelryBox",
            species: boards[0].species,
          }),
        ],
      };
    },
  },
  // Shop furniture: worktables are built, never bought. Like the jigs,
  // the output is equipment — the table comes off the bench crated, to
  // be carried into place. Legs are chunky stock (pallet stringers or
  // 2×4s); the top is plywood. No skill gate: building a real bench is
  // every woodworker's first project.
  ...worktableBuildOperation("worktable1x1", "Build Small Worktable", 35),
  ...worktableBuildOperation("worktable1x2", "Build Worktable", 45),
  ...worktableBuildOperation("worktable1x3", "Build Long Worktable", 55),
  ...worktableBuildOperation("worktable2x2", "Build Big Worktable", 65),
  {
    name: "Build Storage Rack",
    id: "buildStorageRack",
    duration: 30,
    // A cheap deck on stout legs — the one build where OSB belongs.
    // Rack-grade only: good sheets are refused so a rack never eats
    // jig stock by mistake.
    interaction: { kind: "assembly", blueprint: "storageRack" },
    requiredConsumables: blueprintFastenerCost(STORAGE_RACK_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(STORAGE_RACK_BLUEPRINT),
    output: () => {
      return {
        inputs: [],
        outputs: [],
        machineOutputs: ["storageRack" as const],
      };
    },
  },
  // Shop-built worktable upgrades (the vise is bought — it's cast iron).
  // Output goes to upgrade storage; install from a worktable's card.
  {
    name: "Build Tool Drawers",
    id: "buildToolDrawers",
    duration: 30,
    // A sheet carcass with thin drawer stock — deck boards qualify
    interaction: { kind: "assembly", blueprint: "toolDrawers" },
    requiredConsumables: blueprintFastenerCost(TOOL_DRAWERS_BLUEPRINT),
    getInputMaterials: () => blueprintInputs(TOOL_DRAWERS_BLUEPRINT),
    output: () => {
      return {
        inputs: [],
        outputs: [],
        upgradeOutputs: ["toolDrawers" as const],
      };
    },
  },
  {
    name: "Build Material Shelf",
    id: "buildMaterialShelf",
    duration: 20,
    // Two planks laid side by side — that's the whole build, so the
    // blueprint has no fasteners and laying the second plank commits it
    interaction: { kind: "assembly", blueprint: "materialShelf" },
    getInputMaterials: () => blueprintInputs(MATERIAL_SHELF_BLUEPRINT),
    output: () => {
      return {
        inputs: [],
        outputs: [],
        upgradeOutputs: ["materialShelf" as const],
      };
    },
  },
];

/**
 * The worktable builds share one shape: plywood top(s), leg-grade boards,
 * nails, and a stretch of hand work that grants the table itself. The
 * whole recipe reads off the blueprint (bench-work/blueprint.ts): the
 * build lies upside down on the bench, top face-down, rails and
 * stretchers nailed across its underside.
 */
function worktableBuildOperation(
  worktableId:
    "worktable1x1" | "worktable1x2" | "worktable1x3" | "worktable2x2",
  name: string,
  duration: number,
): [Operation] {
  const blueprint: ProductBlueprint = WORKTABLE_BLUEPRINTS[worktableId];
  return [
    {
      name,
      id: `build-${worktableId}`,
      duration,
      interaction: { kind: "assembly", blueprint: worktableId },
      requiredConsumables: blueprintFastenerCost(blueprint),
      getInputMaterials: () => blueprintInputs(blueprint),
      output: () => {
        return {
          inputs: [],
          outputs: [],
          machineOutputs: [worktableId],
        };
      },
    },
  ];
}
