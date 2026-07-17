import { array } from "../../utils/arrayUtils";
import { board, isBoard } from "../board-helpers";
import { MachineType, OperationPhase } from "../Machine";
import { isFinishedProduct, makeMaterial } from "../material-helpers";
import {
  Pallet,
  EndGrainSlice,
  FinishedProduct,
  Board,
  MaterialInstance,
  Panel,
  panelSpecies,
  panelWidth,
  REAL_WOOD_SPECIES,
  Species,
} from "../Materials";
import {
  isPanel,
  isSunrisePattern,
  panel,
  stripsAlternate,
  widthDominantSpecies,
} from "../panel-helpers";

/**
 * Every glue-up cures for the same long stretch once it's in the clamps —
 * the glue doesn't care how many strips you fed it. Curing is hands-free;
 * only the spread-and-clamp handwork differs per operation.
 */
export const GLUE_CURE_TICKS = 60;

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

export const workspace: MachineType = {
  id: "workspace",
  name: "Workspace",
  description: "A workspace for basic operations.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [[0, 1]],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 0,
  // Two slots: the starter hammer plus room for a sander
  toolSlots: 2,
  inputSpaces: 5,
  operations: [
    {
      name: "Dismantle Pallet",
      id: "dismantlePallet",
      requiredSkill: "basicMilling",
      duration: 4,
      inputMaterials: [{ type: ["pallet"], quantity: 1 }],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputPallet = materials[0];
        if (inputPallet.type !== "pallet") {
          throw new Error("Input material is not a pallet");
        }

        const deckBoardsCount = inputPallet.deckBoards.filter(
          (board: boolean) => board
        ).length;
        // Every board pried loose gives its nails back — one per board.
        // A whole pallet worth of prying keeps the rustic shelf free.
        if (deckBoardsCount <= 1) {
          const stringers = array(3).map(() => board("pallet", 4, 6, 3));
          const deckBoards = array(deckBoardsCount).map(() =>
            board("pallet", 3, 4, 1)
          );
          return {
            inputs: [],
            outputs: [...stringers, ...deckBoards],
            consumableOutputs: [
              { id: "nails" as const, amount: 3 + deckBoardsCount },
            ],
          };
        } else {
          const deckBoardsLeft = [
            ...inputPallet.deckBoards,
          ] as typeof inputPallet.deckBoards;
          const index = deckBoardsLeft.findLastIndex((board: boolean) => board === true);
          deckBoardsLeft[index] = false;
          return {
            inputs: [
              makeMaterial<Pallet>({
                ...inputPallet,
                deckBoards: deckBoardsLeft,
              }),
            ],
            outputs: [board("pallet", 3, 4, 1)],
            consumableOutputs: [{ id: "nails" as const, amount: 1 }],
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
      inputMaterials: [
        {
          type: ["board"],
          width: [2],
          length: [2],
          thickness: [4],
          // Clean faces make good glue joints — rough stock won't do
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
      inputMaterials: [
        {
          type: ["board"],
          length: [2],
          thickness: [4],
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
      inputMaterials: [
        { type: ["panel"], length: [2], thickness: [4], quantity: 1 },
        {
          type: ["board"],
          length: [2],
          thickness: [4],
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
      inputMaterials: [
        { type: ["panel"], length: [2], thickness: [4], quantity: 2 },
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
      inputMaterials: [
        // A plywood base plus scrap runners and a fence
        { type: ["plywood"], length: [4], width: [4], quantity: 1 },
        { type: ["board"], width: [4], length: [3], thickness: [1], quantity: 2 },
      ],
      output: () => {
        // The output is tooling, not product: the sled lands in tool
        // storage, ready to mount on the table saw
        return {
          inputs: [],
          outputs: [],
          toolOutputs: ["crosscutSled" as const],
        };
      },
    },
    {
      name: "Glue Up End-Grain Panel",
      id: "glueUpEndGrain",
      requiredSkill: "endGrainBoards",
      duration: 8 + GLUE_CURE_TICKS,
      phases: gluePhases(8),
      inputMaterials: [{ type: ["endGrainSlice"], quantity: 4 }],
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
              length: 1,
              thickness: 8,
              surface: "rough",
            }),
          ],
        };
      },
    },
    {
      name: "Finish End-Grain Board",
      id: "finishEndGrainBoard",
      requiredSkill: "endGrainBoards",
      duration: 45,
      inputMaterials: [
        {
          type: ["panel"],
          length: [1],
          thickness: [8],
          surface: ["sanded"],
          quantity: 1,
          // v1 is the single-species butcher block; checkerboards come
          // with slice orientation later
          matches: (material) =>
            isPanel(material) &&
            material.grain === "end" &&
            panelWidth(material) >= 10 &&
            panelSpecies(material).length === 1 &&
            material.strips[0].species !== "pallet",
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const blank = materials[0];
        if (!isPanel(blank)) {
          throw new Error("Input material is not a panel");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "endGrainCuttingBoard",
              species: blank.strips[0].species,
            }),
          ],
        };
      },
    },
    {
      name: "Finish Cutting Board",
      id: "finishCuttingBoard",
      requiredSkill: "panelWork",
      duration: 20,
      inputMaterials: [
        {
          type: ["panel"],
          length: [2],
          thickness: [3, 4],
          // Food-safe means fully sanded — a planed surface isn't enough
          surface: ["sanded"],
          quantity: 1,
          // A proper cutting board: a panel at least 10" wide, glued from
          // 2" strips of a single real hardwood — no pallet chemicals near
          // food.
          matches: (material) =>
            isPanel(material) &&
            panelWidth(material) >= 10 &&
            material.strips.every((strip) => strip.width === 2) &&
            panelSpecies(material).length === 1 &&
            material.strips[0].species !== "pallet",
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const blank = materials[0];
        if (!isPanel(blank)) {
          throw new Error("Input material is not a panel");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "simpleCuttingBoard",
              species: blank.strips[0].species,
            }),
          ],
        };
      },
    },
    {
      name: "Finish Two-Tone Board",
      id: "finishTwoToneBoard",
      requiredSkill: "twoToneBoards",
      duration: 25,
      inputMaterials: [
        {
          type: ["panel"],
          length: [2],
          thickness: [3, 4],
          surface: ["sanded"],
          quantity: 1,
          // Like a cutting board, but striped from exactly two real woods
          matches: (material) =>
            isPanel(material) &&
            panelWidth(material) >= 10 &&
            material.strips.every((strip) => strip.width === 2) &&
            panelSpecies(material).length === 2 &&
            material.strips.every((strip) => strip.species !== "pallet"),
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const blank = materials[0];
        if (!isPanel(blank)) {
          throw new Error("Input material is not a panel");
        }
        const species = dominantSpecies(blank.strips);
        const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "simpleCuttingBoard",
              species,
              accentSpecies,
            }),
          ],
        };
      },
    },
    {
      name: "Finish Striped Board",
      id: "finishStripedBoard",
      requiredSkill: "stripedBoards",
      duration: 30,
      inputMaterials: [
        {
          type: ["panel"],
          length: [2],
          thickness: [3, 4],
          surface: ["sanded"],
          quantity: 1,
          // A two-tone with discipline: 2" strips of two real woods in
          // strict alternation, at least 10" wide
          matches: (material) =>
            isPanel(material) &&
            panelWidth(material) >= 10 &&
            material.strips.every((strip) => strip.width === 2) &&
            panelSpecies(material).length === 2 &&
            material.strips.every((strip) => strip.species !== "pallet") &&
            stripsAlternate(material.strips),
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const blank = materials[0];
        if (!isPanel(blank)) {
          throw new Error("Input material is not a panel");
        }
        const species = dominantSpecies(blank.strips);
        const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "stripedCuttingBoard",
              species,
              accentSpecies,
            }),
          ],
        };
      },
    },
    {
      name: "Finish Sunrise Board",
      id: "finishSunriseBoard",
      requiredSkill: "sunriseBoards",
      duration: 40,
      inputMaterials: [
        {
          type: ["panel"],
          length: [2],
          thickness: [3, 4],
          surface: ["sanded"],
          quantity: 1,
          // The gradient fade: two real woods, one shrinking strip by
          // strip as the other grows (see isSunrisePattern). Minimum
          // pattern (3,1,2,2,1,3) is already 12" wide.
          matches: (material) =>
            isPanel(material) &&
            panelSpecies(material).length === 2 &&
            material.strips.every((strip) => strip.species !== "pallet") &&
            isSunrisePattern(material.strips),
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const blank = materials[0];
        if (!isPanel(blank)) {
          throw new Error("Input material is not a panel");
        }
        // The wider wood reads as the board's color, the other as accent
        const species = widthDominantSpecies(blank.strips);
        const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "sunriseCuttingBoard",
              species,
              accentSpecies,
            }),
          ],
        };
      },
    },
    {
      name: "Oil Cutting Board",
      id: "oilCuttingBoard",
      requiredSkill: "surfacePrep",
      duration: 6 + 24,
      // The second consumer of hands-free phases: a quick wipe-down, then
      // the oil soaks in on its own time
      phases: [
        { name: "Wipe On Oil", duration: 6, attended: true },
        { name: "Soaking In", duration: 24, attended: false },
      ],
      requiredConsumables: [{ id: "mineralOil", amount: 4 }],
      inputMaterials: [
        {
          type: [
            "simpleCuttingBoard",
            "stripedCuttingBoard",
            "sunriseCuttingBoard",
            "endGrainCuttingBoard",
          ],
          quantity: 1,
          // Boards only get oiled once
          matches: (material) =>
            isFinishedProduct(material) && material.finish === undefined,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const rawBoard = materials[0];
        if (!isFinishedProduct(rawBoard)) {
          throw new Error("Input material is not a cutting board");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              ...rawBoard,
              finish: "mineralOil",
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
      inputMaterials: [
        {
          type: ["board"],
          species: REAL_WOOD_SPECIES,
          length: [4],
          width: [6],
          thickness: [4],
          surface: ["sanded"],
          quantity: 2,
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const boards = materials.filter(isBoard);
        if (boards.length !== 2) {
          throw new Error("Need exactly 2 boards to build a shelf");
        }
        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "shelf",
              species: boards[0].species,
            }),
          ],
        };
      },
    },
  ],
};
