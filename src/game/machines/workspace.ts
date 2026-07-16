import { array } from "../../utils/arrayUtils";
import { board, isBoard } from "../board-helpers";
import { MachineType } from "../Machine";
import { makeMaterial } from "../material-helpers";
import {
  Pallet,
  FinishedProduct,
  Board,
  MaterialInstance,
  panelSpecies,
  panelWidth,
  REAL_WOOD_SPECIES,
  Species,
} from "../Materials";
import { isPanel, panel } from "../panel-helpers";

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
  toolSlots: 1,
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
        if (deckBoardsCount <= 1) {
          const stringers = array(3).map(() => board("pallet", 4, 6, 3));
          const deckBoards = array(deckBoardsCount).map(() =>
            board("pallet", 3, 4, 1)
          );
          return {
            inputs: [],
            outputs: [...stringers, ...deckBoards],
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
          };
        }
      },
    },
    {
      name: "Build Rustic Pallet Shelf",
      id: "buildRusticPalletShelf",
      requiredSkill: "rusticCarpentry",
      duration: 30,
      inputMaterials: [
        { type: ["board"], species: ["pallet"], width: [6], length: [4], quantity: 2 }, // stringers as shelves
        { type: ["board"], species: ["pallet"], width: [4], length: [3], quantity: 3 }, // deck boards as back support
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        // Validate inputs
        const boards = materials.filter((m: MaterialInstance): m is Board => m.type === "board");
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
      name: "Glue Up Panel",
      id: "glueUpPanel",
      requiredSkill: "panelWork",
      duration: 40, // glue needs time to dry
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
