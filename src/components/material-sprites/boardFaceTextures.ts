import { Species } from "../../game/Materials";

/**
 * The raster art for board faces: a library of full-board photographs
 * per species, each standing for one canonical 8-foot × 8-inch plank
 * (BOARD_FACE_SCAN_LENGTH_IN × BOARD_FACE_SCAN_WIDTH_IN — grain runs
 * down the image). A board's face region picks a spot on one scan, and
 * the seed picks which scan, so a species with a few scans yields a
 * whole lumberyard of distinct boards.
 *
 * The edge strips are full-length crops of straight, tight grain — the
 * across-the-rings face a board's edge shows. They share the face
 * window's lengthwise position, so a cut board's edge streaks continue
 * across the seam along with its face.
 *
 * A species with no entry here draws the procedural face BoardSprite
 * has always drawn.
 */
export interface BoardFaceArt {
  /** One full-board scan per entry; the region's seed picks one. */
  readonly faces: ReadonlyArray<string>;
  /** Full-length edge strips; the seed picks one of these too. */
  readonly edges: ReadonlyArray<string>;
  /** Inches of across-grain wood an edge strip spans. */
  readonly edgeSpanInches: number;
}

/** A species keeps its scans in its own folder, numbered from 1. */
const scans = (species: Species, kind: "face" | "edge", count: number) =>
  Array.from(
    { length: count },
    (_, i) => `/images/textures/${species}/${kind}-${i + 1}.jpg`,
  );

export const BOARD_FACE_TEXTURES: Partial<Record<Species, BoardFaceArt>> = {
  oak: {
    faces: scans("oak", "face", 13),
    edges: scans("oak", "edge", 3),
    edgeSpanInches: 3,
  },
};

/**
 * Grayscale wear maps at the same canonical board proportions — white is
 * clean wood, dark is scuffed and saw-marked. Species-independent: the
 * sprite multiplies one over whatever face is underneath (scan art and
 * procedural alike), windowed by the same face region as the grain, so
 * a board's scuffs survive its cuts the way its cathedrals do. Milling
 * fades them: strongest on unmilled stock, gone once a face is smooth.
 */
export const BOARD_ROUGHNESS_TEXTURES: ReadonlyArray<string> = Array.from(
  { length: 5 },
  (_, i) => `/images/textures/shared/roughness-${i + 1}.jpg`,
);

export const BOARD_FACE_TEXTURE_ASSETS = [
  ...Object.values(BOARD_FACE_TEXTURES).flatMap((art) => [
    ...art.faces,
    ...art.edges,
  ]),
  ...BOARD_ROUGHNESS_TEXTURES,
];
