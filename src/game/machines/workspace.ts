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
} from "../Materials";
import { isPanel, panel } from "../panel-helpers";

export const workspace: MachineType = {
  id: "workspace",
  name: "Workspace",
  description: "A workspace for basic operations.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [[0, 1]],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 0,
  toolStorage: 0,
  inputSpaces: 5,
  operations: [
    {
      name: "Dismantle Pallet",
      id: "dismantlePallet",
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
      duration: 40, // glue needs time to dry
      inputMaterials: [
        {
          type: ["board"],
          width: [2],
          length: [2],
          thickness: [4],
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
            ),
          ],
        };
      },
    },
    {
      name: "Finish Cutting Board",
      id: "finishCuttingBoard",
      duration: 20,
      inputMaterials: [
        {
          type: ["panel"],
          length: [2],
          thickness: [3],
          quantity: 1,
          // A proper cutting board: a planed panel at least 10" wide, glued
          // from 2" strips of a single real hardwood — no pallet chemicals
          // near food.
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
  ],
};
