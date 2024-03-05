import { array } from "../../utils/arrayUtils";
import { board } from "../board-helpers";
import { MachineType } from "../Machine";
import { makeMaterial } from "../material-helpers";
import { Pallet } from "../Materials";

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
  inputSpaces: 1,
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
  ],
};
