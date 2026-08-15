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

const oakRange = (count: number, name: string) =>
  Array.from(
    { length: count },
    (_, i) => `/images/textures/${name}-${i + 1}.jpg`,
  );

export const BOARD_FACE_TEXTURES: Partial<Record<Species, BoardFaceArt>> = {
  oak: {
    faces: oakRange(13, "board-oak"),
    edges: oakRange(3, "board-edge-oak"),
    edgeSpanInches: 3,
  },
};

export const BOARD_FACE_TEXTURE_ASSETS = Object.values(
  BOARD_FACE_TEXTURES,
).flatMap((art) => [...art.faces, ...art.edges]);
