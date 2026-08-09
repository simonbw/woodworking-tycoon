// Represents length, width, or thickness.

import { Tuple } from "../utils/typeUtils";
import type { ToolId } from "./Tool";

/**
 * The cross-section detents: width in inches, thickness in quarters of an
 * inch. Lengths are NOT on this scale — a length is a plain number of
 * inches, because cuts do arithmetic on lengths (cutBoard subtracts) and
 * recipes want off-grid values (a 34" crate wall, a 7" birdhouse side).
 */
export const BOARD_DIMENSIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
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

/**
 * The rougher of two conditions. A board carries one surface for the whole
 * piece, so an operation that leaves one face worse than the rest (a resaw
 * opens a fresh sawn face) reports the worst face — the one that still
 * needs work. Per-face surface tracking would let both be remembered.
 */
export function worseSurface(
  a: SurfaceCondition,
  b: SurfaceCondition,
): SurfaceCondition {
  return SURFACE_CONDITIONS.indexOf(a) <= SURFACE_CONDITIONS.indexOf(b) ? a : b;
}

export interface Board {
  readonly id: string;
  readonly type: "board";
  /** Inches. Integer by convention (saws cut at inch marks). */
  readonly length: number;
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

export const SHEET_GOOD_KINDS = [
  "plywoodA", // high quality
  "plywoodB", // medium quality
  "plywoodC", // low quality
  "mdf",
  "osb",
  "particleBoard",
] as const;

export type SheetGoodKind = (typeof SHEET_GOOD_KINDS)[number];

/**
 * Pseudo-species for the sheet goods, so their dust has somewhere to go
 * (see docs/dust-and-cleaning.md). Sheets have no wood species — a
 * plywood sheet is a stack of whatever the mill had — so what they shed
 * is tracked by the sheet family instead: gluey plywood chips, choking
 * MDF powder, the resinous grit off a chip board.
 */
export const SHEET_DUST_SPECIES = [
  "plywood",
  "mdf",
  "osb",
  "particleBoard",
] as const;

export type SheetDustSpecies = (typeof SHEET_DUST_SPECIES)[number];

/**
 * Everything that can land on the floor as dust: the real woods plus the
 * sheet pseudo-species. `GameState.dust`, the dustpan, and the vac
 * canister are all keyed by this.
 */
export const DUST_SPECIES = [...SPECIES, ...SHEET_DUST_SPECIES] as const;

export type DustSpecies = (typeof DUST_SPECIES)[number];

/** Which pseudo-species a sheet sheds — the three plywood grades all
 * make the same mess. */
export function sheetDustSpecies(kind: SheetGoodKind): SheetDustSpecies {
  switch (kind) {
    case "mdf":
    case "osb":
    case "particleBoard":
      return kind;
    default:
      return "plywood";
  }
}

/**
 * Which sheet kinds a recipe accepts is a statement about the work, not
 * the wood budget. A jig base must be flat and hold runner screws — any
 * plywood or MDF, never the chip boards, which sag and crumble around
 * screws. Shop furniture is less picky: particle board tops a worktable
 * honestly, but OSB's lumpy face is fit for nothing that needs flat.
 * The storage rack is the one build where the cheap stuff belongs — and
 * it refuses the good sheets, so a rack never eats jig stock by mistake.
 */
export const JIG_GRADE_KINDS: ReadonlyArray<SheetGoodKind> = [
  "plywoodA",
  "plywoodB",
  "plywoodC",
  "mdf",
];
export const SHOP_FURNITURE_KINDS: ReadonlyArray<SheetGoodKind> = [
  ...JIG_GRADE_KINDS,
  "particleBoard",
];
export const RACK_GRADE_KINDS: ReadonlyArray<SheetGoodKind> = [
  "osb",
  "particleBoard",
  "plywoodC",
];

export interface SheetGood {
  readonly id: string;
  readonly type: "plywood";
  /** Inches — a full sheet is 96 × 48. */
  readonly length: number;
  readonly width: number;
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
  /** Inches, like a board's. */
  readonly length: number;
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

/**
 * Every sellable finished-product type. The single source of truth: the
 * FinishedProduct union, isFinishedProduct, pricing tables, and mock
 * builders all derive from this list — add a product here and the
 * exhaustiveness-checked Records (PRODUCT_VALUES et al.) flag every other
 * site that needs a case.
 */
export const FINISHED_PRODUCT_TYPES = [
  "shelf",
  "rusticShelf",
  "planterBox",
  "jewelryBox",
  "rusticFrame",
  "pictureFrame",
  "simpleCuttingBoard",
  "stripedCuttingBoard",
  "sunriseCuttingBoard",
  "endGrainCuttingBoard",
  "birdhouse",
  "crate",
  "stepStool",
  "hexFrame",
  "servingTray",
  "bookshelf",
  "sideTable",
  "checkerboardCuttingBoard",
] as const;

export type FinishedProductType = (typeof FINISHED_PRODUCT_TYPES)[number];

/**
 * One board in an assembled product's bill of materials: which blueprint
 * slot it fills, the stock it was (Board units: width in inches, length
 * in inches, thickness in quarters), and the grain seed it keeps — the
 * consumed board's own id, so the very grain that lay on the bench is
 * the grain in the finished piece.
 */
export type AssembledPart = {
  readonly slot: string;
  readonly species: Species;
  /** Total width in inches — a board's catalog width, or a panel part's
   * derived strip sum (which outgrows the board catalog). */
  readonly width: number;
  readonly length: number;
  readonly thickness: BoardDimension;
  /** Present when the part is a glued-up panel (a tray's bottom): the
   * very strips that went in, so the finished piece shows the glue-up's
   * stripes. Absent means the part is a plain board. */
  readonly strips?: ReadonlyArray<PanelStrip>;
  /** The board's surface as it went in — sanded stock draws sanded in
   * the finished piece. Absent (older saves) means rough. */
  readonly surface?: SurfaceCondition;
  /** The board's end treatments as it lies in its slot — a frame rail's
   * mirrored miters are what close the corners, so the finished piece
   * keeps them. Absent (older saves, square stock) means square. */
  readonly ends?: BoardEnds;
  readonly seed: string;
};

export type FinishedProduct = {
  readonly id: string;
  readonly type: FinishedProductType;
  readonly species: Species;
  /** Second wood in a two-tone piece (e.g. striped cutting boards). */
  readonly accentSpecies?: Species;
  /** Absent means raw wood — finishing is a separate, value-adding step. */
  readonly finish?: Finish;
  /**
   * The parts a blueprint-assembled product is built from (see
   * bench-work/blueprint.ts). Absent on products from before blueprints
   * (and on non-assembled products); renderers fall back to the
   * blueprint's nominal parts.
   */
  readonly parts?: ReadonlyArray<AssembledPart>;
};

/** One nail in a pallet, at the crossing of a deck board and a stringer
 * — a nail always joins exactly those two boards. */
export type PalletNail = {
  readonly deck: number;
  readonly stringer: number;
};

export type Pallet = {
  readonly id: string;
  readonly type: "pallet";
  readonly deckBoards: Tuple<boolean, 11>;
  /** Which stringers still hold on, top to bottom — per board, like the
   * deck. A board comes free when its last nail is pried. */
  readonly stringers: Tuple<boolean, 3>;
  /** Every nail still driven, one per crossing of two present boards.
   * Prying is per-nail (pryPalletNailAction); these render in both the
   * shop view and the bench view (PalletSprite). */
  readonly nails: ReadonlyArray<PalletNail>;
};

/**
 * A handheld tool as a physical object: in the truck's bed on the ride
 * home, in the arms, in a pile on the floor, or on a station's shelf.
 * It stops being a material when mounted — a station's rack holds plain
 * ToolIds (MachineState.tools), and unmounting mints a fresh instance.
 */
export type ToolItem = {
  readonly id: string;
  readonly type: "tool";
  readonly toolId: ToolId;
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
  | ToolItem
  | UnknownMaterial;

export type MaterialType = MaterialInstance["type"];
