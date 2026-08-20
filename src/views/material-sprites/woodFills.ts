import { Assets, FillInput, Matrix, Texture } from "pixi.js";
import {
  BOARD_FACE_SCAN_LENGTH_IN,
  BOARD_FACE_SCAN_WIDTH_IN,
  BoardFaceRegion,
  Species,
} from "../../game/Materials";
import { seededRandom } from "../../utils/randUtils";
import { PIXELS_PER_INCH } from "../shop-scale";
import { BOARD_END_SPAN_IN, BOARD_FACE_TEXTURES } from "./boardFaceTextures";

/**
 * Every wooden surface in the world is a window onto a photograph, and
 * this is where the windows are cut. A piece names its species and a
 * seed; the seed picks which scans of that species' library it wears,
 * and a face region (BoardFaceRegion) says where on those scans the
 * piece was cut from — which is what makes two halves of a crosscut
 * board still look like one plank.
 *
 * Three surfaces, three fills: the wide face, the narrow edge, and the
 * sawn end. Sprites supply the local point their window's corner lands
 * on and get back a fill they can hand straight to Graphics.fill().
 */
export interface WoodArt {
  readonly face: Texture;
  readonly end: Texture;
  /** Straight-grain edge strip, for the species that have one. */
  readonly edge?: {
    readonly texture: Texture;
    readonly spanInches: number;
    /** Where across the strip this piece's thickness sits. */
    readonly v: number;
  };
}

/**
 * The photographs one piece wears. Drawn from a stream of its own so
 * that adding a surface here never shifts the scans pieces already
 * wear — face first, then the edge strip, then the end.
 */
export function woodArt(
  species: Species,
  seed: string,
  thicknessQuarters = 4,
): WoodArt {
  const art = BOARD_FACE_TEXTURES[species];
  const rng = seededRandom(`${seed}/art`);
  const pick = (paths: ReadonlyArray<string>) =>
    Assets.get<Texture>(paths[Math.floor(rng() * paths.length)]);

  const face = pick(art.faces);
  const edge =
    art.edges !== undefined && art.edgeSpanInches !== undefined
      ? {
          texture: pick(art.edges),
          spanInches: art.edgeSpanInches,
          v: rng() * Math.max(0, art.edgeSpanInches - thicknessQuarters / 4),
        }
      : undefined;
  return { face, end: pick(art.ends), edge };
}

/**
 * Lands the point (u, v) inches of a scan — u along the grain, v across
 * it — at local (originX, originY), at the shop's true scale. PIXI
 * inverts the matrix to build UVs, so this reads as texture-to-local.
 */
export function scanMatrix(
  texture: Texture,
  spanAcrossIn: number,
  spanAlongIn: number,
  u: number,
  v: number,
  originX: number,
  originY: number,
): Matrix {
  return new Matrix(
    (PIXELS_PER_INCH * spanAcrossIn) / texture.source.width,
    0,
    0,
    (PIXELS_PER_INCH * spanAlongIn) / texture.source.height,
    originX - v * PIXELS_PER_INCH,
    originY - u * PIXELS_PER_INCH,
  );
}

/** The wide face, windowed by the piece's region. */
export function faceFill(
  art: WoodArt,
  region: BoardFaceRegion,
  originX: number,
  originY: number,
): FillInput {
  return {
    texture: art.face,
    matrix: scanMatrix(
      art.face,
      BOARD_FACE_SCAN_WIDTH_IN,
      BOARD_FACE_SCAN_LENGTH_IN,
      region.u,
      region.v,
      originX,
      originY,
    ),
    textureSpace: "global",
  };
}

/**
 * The narrow edge: the species' straight-grain strip where it has one,
 * otherwise the face scan carried around the corner from the wood just
 * past the piece's own width — pulled back when that would reach off
 * the scan, which doesn't tile. Either way it shares the face window's
 * lengthwise position, so a cut piece's edge streaks continue across
 * the seam along with its face.
 */
export function edgeFill(
  art: WoodArt,
  region: BoardFaceRegion,
  widthIn: number,
  thicknessQuarters: number,
  originX: number,
  originY: number,
): FillInput {
  if (art.edge !== undefined) {
    return {
      texture: art.edge.texture,
      matrix: scanMatrix(
        art.edge.texture,
        art.edge.spanInches,
        BOARD_FACE_SCAN_LENGTH_IN,
        region.u,
        art.edge.v,
        originX,
        originY,
      ),
      textureSpace: "global",
    };
  }
  const v = Math.max(
    0,
    Math.min(
      region.v + widthIn,
      BOARD_FACE_SCAN_WIDTH_IN - thicknessQuarters / 4,
    ),
  );
  return {
    texture: art.face,
    matrix: scanMatrix(
      art.face,
      BOARD_FACE_SCAN_WIDTH_IN,
      BOARD_FACE_SCAN_LENGTH_IN,
      region.u,
      v,
      originX,
      originY,
    ),
    textureSpace: "global",
  };
}

/**
 * A sawn end: growth rings on the cut face. The crop spans
 * BOARD_END_SPAN_IN across and whatever its own aspect makes of that
 * down, and the window slides inside whatever room the piece's
 * cross-section leaves.
 */
export function endFill(
  art: WoodArt,
  seed: string,
  acrossIn: number,
  alongIn: number,
  originX: number,
  originY: number,
): FillInput {
  const spanAlong =
    (BOARD_END_SPAN_IN * art.end.source.height) / art.end.source.width;
  const rng = seededRandom(`${seed}/end`);
  const v = rng() * Math.max(0, BOARD_END_SPAN_IN - acrossIn);
  const u = rng() * Math.max(0, spanAlong - alongIn);
  return {
    texture: art.end,
    matrix: scanMatrix(
      art.end,
      BOARD_END_SPAN_IN,
      spanAlong,
      u,
      v,
      originX,
      originY,
    ),
    textureSpace: "global",
  };
}

/**
 * How much darker a surface turning away from the light sits than the
 * face beside it. An edge gets one coat, an end two — end grain drinks
 * light — and that shading is what gives a piece thickness from above.
 */
export const TURNED_AWAY_SHADE = { color: 0x000000, alpha: 0.22 } as const;
