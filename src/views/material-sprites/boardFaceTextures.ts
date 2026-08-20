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
 * across the seam along with its face. A species without strips windows
 * its own face scan instead, compressed across the grain so it reads as
 * edge grain (see edgeFill in woodFills.ts).
 *
 * The end crops are sawn crosscut faces, growth rings and all, for the
 * pieces that show one (a board stood on its end).
 */
export interface BoardFaceArt {
  /** One full-board scan per entry; the region's seed picks one. */
  readonly faces: ReadonlyArray<string>;
  /** Full-length edge strips; the seed picks one of these too. Absent
   * until the species has edge art — the face scan stands in. */
  readonly edges?: ReadonlyArray<string>;
  /** Inches of across-grain wood an edge strip spans. */
  readonly edgeSpanInches?: number;
  /** Crosscut end faces; the seed picks one. */
  readonly ends: ReadonlyArray<string>;
}

/** Inches of board width one end crop's full image spans; its height in
 * inches follows from the image's own aspect. Sized so a wide board's
 * end still fits inside one crop. */
export const BOARD_END_SPAN_IN = 10;

/** A species keeps its scans in its own folder, numbered from 1. The
 * folder is the species name lowercased (purpleHeart → purpleheart). */
const scans = (
  species: Species,
  kind: "face" | "edge" | "end",
  count: number,
) =>
  Array.from(
    { length: count },
    (_, i) => `/images/textures/${species.toLowerCase()}/${kind}-${i + 1}.jpg`,
  );

const art = (
  species: Species,
  faceCount: number,
  endCount: number,
): BoardFaceArt => ({
  faces: scans(species, "face", faceCount),
  ends: scans(species, "end", endCount),
});

export const BOARD_FACE_TEXTURES: Record<Species, BoardFaceArt> = {
  pallet: art("pallet", 9, 4),
  pine: art("pine", 21, 4),
  poplar: art("poplar", 10, 4),
  oak: {
    ...art("oak", 13, 4),
    edges: scans("oak", "edge", 3),
    edgeSpanInches: 3,
  },
  maple: art("maple", 10, 4),
  cherry: art("cherry", 12, 4),
  walnut: art("walnut", 5, 8),
  mahogany: art("mahogany", 11, 4),
  purpleHeart: art("purpleHeart", 11, 4),
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
  ...Object.values(BOARD_FACE_TEXTURES).flatMap((species) => [
    ...species.faces,
    ...(species.edges ?? []),
    ...species.ends,
  ]),
  ...BOARD_ROUGHNESS_TEXTURES,
];
