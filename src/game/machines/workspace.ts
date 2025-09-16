import { array } from "../../utils/arrayUtils";
import { board } from "../board-helpers";
import { MachineType } from "../Machine";
import { makeMaterial } from "../material-helpers";
import { Pallet, FinishedProduct, Board } from "../Materials";

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
  inputSpaces: 3,
  operations: [
    {
      name: "Dismantle Pallet",
      id: "dismantlePallet",
      duration: 10,
      inputMaterials: [{ type: ["pallet"], quantity: 1 }],
      output: (materials) => {
        const inputPallet = materials[0];
        if (inputPallet.type !== "pallet") {
          throw new Error("Input material is not a pallet");
        }

        const deckBoardsCount = inputPallet.deckBoards.filter(
          (board) => board
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
          const index = deckBoardsLeft.findLastIndex((board) => board === true);
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
      name: "Build Pallet Wood Shelf",
      id: "buildPalletShelf",
      duration: 30,
      inputMaterials: [
        { type: ["board"], species: ["pallet"], width: [4], length: [2], quantity: 2 }, // shelf boards cut to 2'
        { type: ["board"], species: ["pallet"], width: [6], length: [2], quantity: 1 }, // back support cut to 2'
      ],
      output: (materials) => {
        // Validate inputs - we expect 3 boards total
        const boards = materials.filter((m): m is Board => m.type === "board");
        if (boards.length !== 3) {
          throw new Error("Need exactly 3 boards to build a shelf");
        }

        // Use the species from the first board for the finished shelf
        const species = boards[0].species;

        return {
          inputs: [],
          outputs: [
            makeMaterial<FinishedProduct>({
              type: "shelf",
              species: species,
            }),
          ],
        };
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
      output: (materials) => {
        // Validate inputs
        const boards = materials.filter((m): m is Board => m.type === "board");
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
  ],
};
