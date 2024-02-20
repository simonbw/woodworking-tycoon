import { repeat } from "../utils/arrayUtils";
import { Vector } from "./Vectors";
import { MaterialInstance } from "./Materials";
import { board, cutBoard, isBoard } from "./material-helpers";

export interface MachineType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly operations: ReadonlyArray<MachineOperation>;
  readonly cellsOccupied: ReadonlyArray<Vector>;
  readonly freeCellsNeeded: ReadonlyArray<Vector>;
  readonly operationPosition: Vector;
  readonly cost: number;
  readonly materialStorage: number;
  readonly toolStorage: number;
  readonly className?: string;
}

export type InputMaterial = Pick<MaterialInstance, "type"> &
  Partial<MaterialInstance>;

export type InputMaterialWithQuantity = InputMaterial & {
  readonly quantity: number;
};

export interface MachineOperation {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly inputMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly output: (
    materials: ReadonlyArray<MaterialInstance>
  ) => ReadonlyArray<MaterialInstance>;
}

export const MACHINES = {
  makeshiftWorkbench: {
    id: "makeshiftWorkbench",
    name: "Makeshift Workbench",
    description: "A workbench for basic operations.",
    cellsOccupied: [[0, 0]],
    freeCellsNeeded: [[0, 1]],
    operationPosition: [0, 1],
    cost: 0,
    materialStorage: 0,
    toolStorage: 0,
    operations: [
      {
        name: "Break Down Pallet",
        id: "breakDownPallet",
        duration: 10,
        inputMaterials: [{ type: "pallet", quantity: 1 }],
        output: (materials) => {
          const inputPallet = materials[0];
          if (inputPallet.type !== "pallet") {
            throw new Error("Input material is not a pallet");
          }
          const deckBoard = board("pallet", 3, 4, 1);
          const stringerBoard = board("pallet", 4, 6, 3);
          return [...repeat(deckBoard, 11), ...repeat(stringerBoard, 3)];
        },
      },
    ],
    className: "fill-amber-600 drop-shadow-md",
  },

  jobsiteTableSaw: {
    id: "jobsiteTableSaw",
    name: "Jobsite Table Saw",
    description: "A portable table saw for cutting wood.",
    cellsOccupied: [[0, 0]],
    freeCellsNeeded: [
      [0, 1],
      [0, -1],
    ],
    operationPosition: [0, 1],
    cost: 100,
    materialStorage: 0,
    toolStorage: 0,
    operations: [
      {
        name: "Rip Board",
        id: "ripBoard",
        duration: 15,
        inputMaterials: [{ type: "board", quantity: 1 }],
        output: (materials) => {
          const inputBoard = materials[0];
          if (!isBoard(inputBoard)) {
            throw new Error("Input material is not a board");
          }
          return cutBoard(inputBoard, 1, "width");
        },
      },
    ],
    className: "fill-gray-500 stroke-[0.1] stroke-yellow-500 drop-shadow-md",
  },
} satisfies { [id: string]: MachineType };