// Represents length, width, or thickness.

import { Tuple } from "../utils/typeUtils";

export const BOARD_DIMENSIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const; // either feet, inches, or quarters of an inch
export const SHEET_THICKNESSES = [1, 2, 3, 4] as const; // in quarters of an inch
export type BoardDimension = (typeof BOARD_DIMENSIONS)[number];
export type SheetThickness = (typeof SHEET_THICKNESSES)[number];

export const SPECIES = [
  "pallet",
  "pine",
  "oak",
  "maple",
  "cherry",
  "walnut",
  "mahogany",
  "purpleHeart",
] as const;

export type Species = (typeof SPECIES)[number];

export interface Board {
  readonly id: string;
  readonly type: "board";
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: BoardDimension;
  readonly species: Species;
}

export type SheetGoodKind =
  | "plywoodA" // high quality
  | "plywoodB" // medium quality
  | "plywoodC" // low quality
  | "mdf"
  | "osb"
  | "particleBoard";

export interface SheetGood {
  readonly id: string;
  readonly type: "plywood";
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: SheetThickness;
  readonly kind: SheetGoodKind;
}

export type FinishedProduct = {
  readonly id: string;
  readonly type: "shelf" | "rusticShelf" | "jewelryBox" | "simpleCuttingBoard";
  readonly species: Species;
};

export type Pallet = {
  readonly id: string;
  readonly type: "pallet";
  readonly deckBoards: Tuple<boolean, 11>;
  readonly stringerBoardsLeft: number;
};

export type UnknownMaterial = {
  readonly id: string;
  readonly type: "unknown";
};

export type MaterialInstance =
  | Pallet
  | Board
  | SheetGood
  | FinishedProduct
  | UnknownMaterial;

export type MaterialType = MaterialInstance["type"];
