import { isBoard } from "../board-helpers";
import { MachineType } from "../Machine";
import { makeMaterial } from "../material-helpers";
import {
  FinishedProduct,
  MaterialInstance,
  REAL_WOOD_SPECIES,
} from "../Materials";

export const makeshiftBench: MachineType = {
  id: "makeshiftBench",
  name: "Makeshift Bench",
  description: "A makeshift bench for tools and detail work.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [[0, 1]],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 0,
  toolSlots: 3,
  className: "fill-brown-800 drop-shadow-md",
  inputSpaces: 4,
  operations: [
    {
      name: "Build Jewelry Box",
      id: "buildJewelryBox",
      requiredSkill: "boxJoinery",
      duration: 45,
      inputMaterials: [
        {
          type: ["board"],
          species: REAL_WOOD_SPECIES,
          length: [2],
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
  ],
};
