// Represents length, width, or thickness.

const BOARD_DIMENSIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type BoardDimension = (typeof BOARD_DIMENSIONS)[number];

export type Species =
  | "pallet"
  | "pine"
  | "oak"
  | "maple"
  | "cherry"
  | "walnut"
  | "mahogany";

export interface Board {
  readonly type: "board";
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: BoardDimension;
  readonly species: Species;
}

export type SheetGoodKind =
  | "plywoodA"
  | "plywoodB"
  | "plywoodC"
  | "mdf"
  | "osb"
  | "particleBoard";

export interface SheetGood {
  readonly type: "plywood";
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: 1 | 2 | 3 | 4; // 1/4", 1/2", 3/4", 1"
  readonly kind: SheetGoodKind;
}

export type FinishedProduct = {
  type: "shelf" | "jewlryBox" | "simpleCuttingBoard";
  species: Species;
};

export type Pallet = {
  type: "pallet";
};

export type MaterialInstance = Pallet | Board | SheetGood | FinishedProduct;

export type MaterialId = MaterialInstance["type"];
