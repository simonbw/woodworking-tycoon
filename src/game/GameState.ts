export interface GameState {
  readonly money: number;
  readonly materials: Material[];
  readonly tools: Tool[];
  readonly machines: MachinePlacement[];
  readonly commissions: Commission[];
  readonly shopInfo: ShopInfo;
}

export interface ShopInfo {
  size: [number, number];
}

export type Position = [number, number];

export interface MachinePlacement {
  readonly machine: Machine;
  readonly position: Position;
  readonly rotation: 0 | 1 | 2 | 3;
}

export interface Commission {
  readonly requiredMaterials: readonly Material[];
  readonly reward: number;
}

export interface Material {
  readonly id: string;
  readonly name: string;
  readonly storageSize: number;
  readonly finalProduct?: boolean;
  readonly value?: number;
}

export interface Tool {
  readonly id: string;
  readonly name: string;
}

export interface Recipe {
  readonly id: string;
  readonly name: string;
  readonly inputMaterials: readonly Material[];
  readonly outputMaterials: readonly Material[];
}

export interface Operation {
  readonly recipe: Recipe;
  readonly duration: number;
}

export interface Machine {
  readonly id: string;
  readonly name: string;
  readonly operations: readonly Operation[];
  readonly cellsOccupied: readonly Position[];
  readonly freeCellsNeeded: readonly Position[];
  readonly operationPosition: Position;
}

export const MATERIALS = {
  pallet: { id: "pallet", name: "Pallet", storageSize: 10 },
  board: { id: "board", name: "Board", storageSize: 1 },
  sandedBoard: { id: "sandedBoard", name: "Sanded Board", storageSize: 1 },
  shelf: {
    id: "shelf",
    name: "Shelf",
    storageSize: 1,
    finalProduct: true,
    value: 10,
  },
  box: {
    id: "box",
    name: "Box",
    storageSize: 10,
    finalProduct: true,
    value: 50,
  },
} satisfies { [key: string]: Material };

// TODO: Figure out how to guarantee that key and id fields always match
export const TOOLS = {
  handSaw: { id: "handSaw", name: "Hand Saw" },
} satisfies { [key: string]: Tool };

export const RECIPES = {
  cutPallet: {
    id: "cutPallet",
    name: "Cut Pallet",
    inputMaterials: [MATERIALS.pallet],
    outputMaterials: [
      MATERIALS.board,
      MATERIALS.board,
      MATERIALS.board,
      MATERIALS.board,
      MATERIALS.board,
    ],
  },
  sandBoard: {
    id: "sandBoard",
    name: "Sand Board",
    inputMaterials: [MATERIALS.board],
    outputMaterials: [MATERIALS.sandedBoard],
  },
  assembleShelf: {
    id: "assembleShelf",
    name: "Assemble Shelf",
    inputMaterials: [MATERIALS.sandedBoard],
    outputMaterials: [MATERIALS.shelf],
  },
  assembleBox: {
    id: "assembleBox",
    name: "Assemble Box",
    inputMaterials: [
      MATERIALS.sandedBoard,
      MATERIALS.sandedBoard,
      MATERIALS.sandedBoard,
      MATERIALS.sandedBoard,
    ],
    outputMaterials: [MATERIALS.shelf],
  },
} satisfies { [key: string]: Recipe };

export const MACHINES = {
  workBench: {
    id: "workBench",
    name: "Work Bench",
    cellsOccupied: [
      [0, 0],
      [1, 0],
    ],
    freeCellsNeeded: [],
    operationPosition: [1, 1],
    operations: [
      { recipe: RECIPES.cutPallet, duration: 10 },
      { recipe: RECIPES.sandBoard, duration: 10 },
      { recipe: RECIPES.assembleShelf, duration: 10 },
    ],
  },
} satisfies { [key: string]: Machine };
