// Represents length, width, or thickness.

import { boolean } from "zod";
import { Tuple } from "../utils/typeUtils";

export const BOARD_DIMENSIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type BoardDimension = (typeof BOARD_DIMENSIONS)[number];

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
  | "plywoodA"
  | "plywoodB"
  | "plywoodC"
  | "mdf"
  | "osb"
  | "particleBoard";

export interface SheetGood {
  readonly id: string;
  readonly type: "plywood";
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: 1 | 2 | 3 | 4; // 1/4", 1/2", 3/4", 1"
  readonly kind: SheetGoodKind;
}

export type FinishedProduct = {
  readonly id: string;
  readonly type: "shelf" | "jewelryBox" | "simpleCuttingBoard";
  readonly species: Species;
};

export type Pallet = {
  readonly id: string;
  readonly type: "pallet";
  readonly deckBoardsLeft: Tuple<boolean, 11>;
  readonly stringerBoardsLeft: number;
};

export type MaterialInstance = Pallet | Board | SheetGood | FinishedProduct;

export type MaterialId = MaterialInstance["type"];
