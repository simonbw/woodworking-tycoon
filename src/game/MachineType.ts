import { array } from "../utils/arrayUtils";
import { BOARD_DIMENSIONS, Board, MaterialInstance } from "./Materials";
import { Vector } from "./Vectors";
import { board, cutBoard, isBoard } from "./material-helpers";

export interface MachineType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly operations: ReadonlyArray<MachineOperation>;
  readonly cellsOccupied: ReadonlyArray<Vector>;
  readonly freeCellsNeeded: ReadonlyArray<Vector>;
  readonly operationPosition?: Vector;
  readonly cost: number;
  readonly materialStorage: number;
  readonly toolStorage: number;
  readonly className?: string;
}

export type InputMaterial<T extends MaterialInstance = MaterialInstance> = {
  [K in keyof T]?: ReadonlyArray<T[K]>;
};

export type InputMaterialWithQuantity<
  T extends MaterialInstance = MaterialInstance
> = InputMaterial<T> & {
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
  makeshiftBench: {
    id: "makeshiftBench",
    name: "Makeshift Bench",
    description: "A makeshift bench to place tools on.",
    cellsOccupied: [[0, 0]],
    freeCellsNeeded: [[0, 1]],
    cost: 0,
    materialStorage: 0,
    toolStorage: 0,
    className: "fill-brown-800 drop-shadow-md",
    operations: [],
  },

  workspace: {
    id: "workspace",
    name: "Workspace",
    description: "A workspace for basic operations.",
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
        inputMaterials: [{ type: ["pallet"], quantity: 1 }],
        output: (materials) => {
          const inputPallet = materials[0];
          if (inputPallet.type !== "pallet") {
            throw new Error("Input material is not a pallet");
          }

          return [
            // 11 deck boards
            ...array(11).map(() => board("pallet", 3, 4, 1)),
            // 3 stringer boards
            ...array(3).map(() => board("pallet", 4, 6, 3)),
          ];
        },
      },
    ],
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
    cost: 300,
    materialStorage: 0,
    toolStorage: 0,
    operations: [
      {
        name: "Rip Board",
        id: "ripBoard",
        duration: 15,
        inputMaterials: [
          {
            type: ["board"] as const,
            width: BOARD_DIMENSIONS.filter((d) => d > 1),
            quantity: 1,
          } satisfies InputMaterialWithQuantity<Board>,
        ],
        output: (materials) => {
          const inputBoard = materials[0];
          if (!isBoard(inputBoard)) {
            throw new Error("Input material is not a board");
          }
          return cutBoard(inputBoard, 1, "width");
        },
      },
    ],
  },

  miterSaw: {
    id: "miterSaw",
    name: "Miter Saw",
    description: "A portable table saw for cutting wood.",
    cellsOccupied: [[0, 0]],
    freeCellsNeeded: [],
    operationPosition: [0, 1],
    cost: 150,
    materialStorage: 0,
    toolStorage: 0,
    operations: [
      {
        name: "Cut Board",
        id: "cutBoard",
        duration: 15,
        inputMaterials: [
          {
            type: ["board"],
            length: BOARD_DIMENSIONS.filter((d) => d > 1),
            quantity: 1,
          },
        ],
        output: (materials) => {
          const inputBoard = materials[0];
          if (!isBoard(inputBoard)) {
            throw new Error("Input material is not a board");
          }
          return cutBoard(inputBoard, 1, "length");
        },
      },
    ],
  },
} satisfies { [id: string]: MachineType };

export type MachineId = keyof typeof MACHINES;
