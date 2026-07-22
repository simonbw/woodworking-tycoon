// Represents length, width, or thickness.

import { Tuple } from "../utils/typeUtils";

export const BOARD_DIMENSIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const; // either feet, inches, or quarters of an inch
export const SHEET_THICKNESSES = [1, 2, 3, 4] as const; // in quarters of an inch
export type BoardDimension = (typeof BOARD_DIMENSIONS)[number];
export type SheetThickness = (typeof SHEET_THICKNESSES)[number];

export const SPECIES = [
  "pallet",
  "pine",
  "poplar",
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
 * always come out "rough". Finish quality only — geometry (flat, straight)
 * lives on the jointed axes below. Sanding never flattens anything.
 */
export const SURFACE_CONDITIONS = ["rough", "smooth", "sanded"] as const;
export type SurfaceCondition = (typeof SURFACE_CONDITIONS)[number];

/**
 * How many of a board's faces (or edges) are jointed true. Milling is two
 * independent axes, not a ladder: after a reference face and edge exist,
 * planing (faces 2) and ripping (edges 2) can happen in either order.
 *
 * Faces: 0 = rough/possibly warped, 1 = one flat reference face,
 * 2 = faces parallel ("planed"). Ends are never tracked — crosscuts have no
 * prerequisites. Milling never consumes nominal dimension: "rough" stock
 * carries sacrificial material beyond its listed size.
 */
export type JointedCount = 0 | 1 | 2;

/**
 * The magnitudes of a saw's angle stops, measured off square — 0° is a
 * plain crosscut. 45° makes rectangular frames; 30° and 22.5° are the
 * hexagon and octagon stops.
 */
export const MITER_ANGLES = [22.5, 30, 45] as const;
export type MiterAngle = (typeof MITER_ANGLES)[number];

/**
 * A mitered end's angle is SIGNED — a real saw head swings both ways off
 * square, and the sign is what distinguishes the two shapes two 45° ends
 * can make. Convention: both ends are measured with the same rotational
 * sense (the angle of the cut line off the width axis, board laid along
 * x), so ends with EQUAL angles are parallel (a parallelogram) and ends
 * with OPPOSITE angles mirror (a frame rail). Because a faceless board
 * can be flipped over — which negates both ends at once — anything
 * comparing ends must compare their relative sign, never absolute.
 */
export type SignedMiterAngle = MiterAngle | -22.5 | -30 | -45;

/**
 * What one end of a board looks like. A discriminated union so future end
 * features (tenons, dowel holes) slot in as new kinds; per-end state exists
 * because advanced work cares WHICH end carries the treatment.
 */
export type BoardEnd =
  | { readonly kind: "square" }
  | { readonly kind: "mitered"; readonly angle: SignedMiterAngle };

export interface BoardEnds {
  readonly left: BoardEnd;
  readonly right: BoardEnd;
}

export const SQUARE_END: BoardEnd = { kind: "square" };

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
  /** Flat faces: planing requires 1 (a reference face) and produces 2. */
  readonly jointedFaces: JointedCount;
  /** Straight edges: ripping and gluing require them (see board-helpers). */
  readonly jointedEdges: JointedCount;
  /**
   * End treatments, left and right as the board lies on the saw. Absent
   * means both ends square (pre-miter saves and untouched stock — the
   * Panel.grain precedent). Length cuts rewrite these (see cutBoard).
   */
  readonly ends?: BoardEnds;
}

/** A board's end state with the square/square default applied. */
export function boardEnds(board: Board): BoardEnds {
  return board.ends ?? { left: SQUARE_END, right: SQUARE_END };
}

/**
 * Short label for a board's end treatments, or null when both ends are the
 * unremarkable square default. Reads like a cut list: "45° both ends" is
 * the mirrored (frame-rail) pair; equal-signed ends — the same magnitude
 * leaning the same way — read "parallel ends". A lone miter's sign is
 * meaningless on a faceless board, so single ends show the magnitude.
 */
export function endsLabel(board: Board): string | null {
  const { left, right } = boardEnds(board);
  if (left.kind === "mitered" && right.kind === "mitered") {
    if (left.angle === -right.angle) {
      return `${Math.abs(left.angle)}° both ends`;
    }
    if (left.angle === right.angle) {
      return `${Math.abs(left.angle)}° parallel ends`;
    }
    return `${left.angle}°/${right.angle}° ends`;
  }
  const mitered = left.kind === "mitered" ? left : right;
  return mitered.kind === "mitered"
    ? `${Math.abs(mitered.angle)}° one end`
    : null;
}

/**
 * Short label for a board's milled state, or null when it's the unremarkable
 * default (a flat-enough, straight-edged board — pallet stock and any board
 * from before the milling system).
 */
export function millingLabel(board: Board): string | null {
  const { jointedFaces: faces, jointedEdges: edges } = board;
  if (faces === 2) {
    return edges === 2 ? "S4S" : edges === 1 ? "S3S" : "S2S";
  }
  if (faces === 0) {
    return "rough sawn";
  }
  return edges === 2 ? null : "face jointed";
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
    | "planterBox"
    | "jewelryBox"
    | "pictureFrame"
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

/**
 * Sawdust swept off the floor, waiting for the dustpan trip to the
 * garbage can. Carries the species mix it was swept from (in dust units,
 * see Dust.ts) so a pile of walnut shavings looks like one.
 */
export type SawdustPile = {
  readonly id: string;
  readonly type: "sawdustPile";
  readonly contents: Readonly<Partial<Record<Species, number>>>;
};

export type MaterialInstance =
  | Pallet
  | Board
  | SheetGood
  | Panel
  | EndGrainSlice
  | FinishedProduct
  | SawdustPile
  | UnknownMaterial;

export type MaterialType = MaterialInstance["type"];
