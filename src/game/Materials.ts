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

/** Every species except reclaimed pallet wood — the ones fit for real work. */
export const REAL_WOOD_SPECIES: ReadonlyArray<Species> = SPECIES.filter(
  (species) => species !== "pallet",
);

/**
 * Surface quality ladder (see docs/tools-and-surfaces.md). Sanding bumps a
 * material one step up; planing produces "smooth" (never "sanded"); glue-ups
 * always come out "rough". Scalar for now — widens to per-face state if S2S
 * lumber or face-specific operations ever matter.
 */
export const SURFACE_CONDITIONS = ["rough", "smooth", "sanded"] as const;
export type SurfaceCondition = (typeof SURFACE_CONDITIONS)[number];

/** The next step up the surface ladder, or null at the top. */
export function improvedSurface(
  surface: SurfaceCondition,
): SurfaceCondition | null {
  const index = SURFACE_CONDITIONS.indexOf(surface);
  return SURFACE_CONDITIONS[index + 1] ?? null;
}

export interface Board {
  readonly id: string;
  readonly type: "board";
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: BoardDimension;
  readonly species: Species;
  readonly surface: SurfaceCondition;
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

/** One strip of wood in a glued-up panel. */
export interface PanelStrip {
  readonly species: Species;
  readonly width: BoardDimension;
}

/**
 * A glued-up panel: an ordered list of strips sharing one length and
 * thickness. Total width is derived (see panelWidth), so it can exceed the
 * largest stock board dimension — that's the point of gluing. The strip list
 * carries species per strip, so multi-species patterns price and render
 * correctly with no extra machinery.
 */
export interface Panel {
  readonly id: string;
  readonly type: "panel";
  readonly length: BoardDimension;
  readonly thickness: BoardDimension;
  readonly strips: ReadonlyArray<PanelStrip>;
  readonly surface: SurfaceCondition;
  /**
   * Which way the fibers face. "end" panels (crosscut slices re-glued
   * grain-up) can never be planed — a planer tears end grain apart — so
   * sanding is the only way to flatten them. Absent means "long".
   */
  readonly grain?: "long" | "end";
}

/**
 * One crosscut slice of a long-grain panel, destined to be stood on end
 * and glued into an end-grain panel. Carries the source panel's strip
 * pattern — that's what makes checkerboards possible later.
 */
export interface EndGrainSlice {
  readonly id: string;
  readonly type: "endGrainSlice";
  readonly strips: ReadonlyArray<PanelStrip>;
  /** Thickness of the source panel — the slice's glue-face width. */
  readonly thickness: BoardDimension;
}

/** Total width is derived from the strips — never stored. */
export function panelWidth(panel: Panel): number {
  return panel.strips.reduce((sum, strip) => sum + strip.width, 0);
}

/** The distinct species in a panel, in first-appearance order. */
export function panelSpecies(panel: Panel): ReadonlyArray<Species> {
  return [...new Set(panel.strips.map((strip) => strip.species))];
}

/**
 * Applied finishes. Mineral oil is the food-safe one — the only finish a
 * cutting board takes. Film finishes (wax oil, lacquer, poly) join this
 * union when the wider finishing system lands.
 */
export const FINISHES = ["mineralOil"] as const;
export type Finish = (typeof FINISHES)[number];

export type FinishedProduct = {
  readonly id: string;
  readonly type:
    | "shelf"
    | "rusticShelf"
    | "jewelryBox"
    | "simpleCuttingBoard"
    | "stripedCuttingBoard"
    | "sunriseCuttingBoard"
    | "endGrainCuttingBoard";
  readonly species: Species;
  /** Second wood in a two-tone piece (e.g. striped cutting boards). */
  readonly accentSpecies?: Species;
  /** Absent means raw wood — finishing is a separate, value-adding step. */
  readonly finish?: Finish;
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
  | Panel
  | EndGrainSlice
  | FinishedProduct
  | UnknownMaterial;

export type MaterialType = MaterialInstance["type"];
