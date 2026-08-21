import { Assets, Container, Graphics, Matrix, Texture } from "pixi.js";
import { PIXELS_PER_INCH } from "../shop-scale";
import {
  Board,
  BOARD_FACE_SCAN_LENGTH_IN,
  BOARD_FACE_SCAN_WIDTH_IN,
  defaultBoardFace,
} from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";
import { seededRandom } from "../../utils/randUtils";
import { BOARD_ROUGHNESS_TEXTURES } from "./boardFaceTextures";
import { drawContactShadow } from "./contactShadow";
import {
  edgeFill,
  endFill,
  faceFill,
  TURNED_AWAY_SHADE,
  woodArt,
} from "./woodFills";

/**
 * The board renderers — the old BoardSprite / BoardOnEdgeSprite /
 * BoardOnEndSprite as imperative builders and draw functions. Same
 * drawing, no React: callers own the returned display objects.
 */

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

/** The board data the renderers read — everything but identity. */
export type BoardLook = Omit<Board, "id" | "type">;

export interface BoardSpriteOptions {
  alpha?: number;
  tint?: number;
}

/**
 * A board's milled state is drawn, not labeled:
 * - Every species wears a window of a real plank photograph
 *   (boardFaceTextures.ts), placed by the board's face region so a cut
 *   piece keeps the very grain it was cut with.
 * - Seen from above, a lying board is nothing but its face — thickness
 *   reads through the contact shadow's spread, not a drawn edge strip.
 *   The edge face only shows on a board actually stood on it
 *   (drawBoardOnEdge), which is what keeps the two orientations
 *   distinct at a glance.
 * - Roughness is real too: a grayscale wear map multiplies over the face
 *   (white is clean wood, dark is scuffs and saw marks), windowed by the
 *   same region so a board's scars survive its cuts. Milling fades it —
 *   full strength on unmilled stock, half once the color is revealed,
 *   gone when the surface is smooth.
 * - Unjointed faces on rough stock additionally hide under a
 *   weathered-gray veil; jointing (or sanding) lifts it and the same
 *   grain comes up in color.
 * - Unjointed long edges are wavy; jointing snaps them straight, right
 *   edge first.
 * - Sanded adds a lighter tone and a sheen band.
 * - Mitered ends draw as diagonals: the left end is the sprite's top, the
 *   right end its bottom, and the angle sets the diagonal's run.
 * All irregularity is seeded so a board never shimmers between renders.
 *
 * A Container of two Graphics — the base drawing, and the wear map
 * multiplied over it — because a multiply blend needs its own layer.
 */
export function createBoardSprite(
  board: BoardLook,
  seed?: string,
  options: BoardSpriteOptions = {},
): Container {
  const { thickness, species, surface, jointedFaces } = board;
  const { alpha, tint } = options;

  const fallbackSeed =
    seed ?? `${species}-${board.width}x${board.length}x${thickness}`;
  const colorRevealed = jointedFaces > 0 || surface !== "rough";

  // The board's window onto its source plank (inches on the canonical
  // scan rectangle) — drives the face art AND the wear map, so both
  // survive a cut together.
  const region =
    board.face ?? defaultBoardFace(fallbackSeed, board.length, board.width);

  const silhouette = boardSilhouette(board, fallbackSeed);
  const { width, height, amp, topSkew, bottomSkew } = silhouette;

  const root = new Container();
  if (alpha !== undefined) root.alpha = alpha;
  const g = root.addChild(new Graphics());
  if (tint !== undefined) g.tint = tint;

  drawContactShadow(g, -width / 2, -height / 2, width, height, thickness / 4);

  const art = woodArt(species, region.seed, thickness);
  g.poly(silhouette.facePoly);
  g.fill(faceFill(art, region, -width / 2, -height / 2));

  // Weathering and finish read as veils over the real grain: the gray
  // lifts when milling reveals the wood, sanding brightens it
  if (!colorRevealed) {
    g.poly(silhouette.facePoly);
    g.fill({ color: WEATHERED_GRAY, alpha: 0.62 });
  } else if (surface === "sanded") {
    g.poly(silhouette.facePoly);
    g.fill({ color: 0xffffff, alpha: 0.1 });
  }

  const inset = amp + 1.5;
  // Surface detail stays inside the mitered silhouette
  const detailTop = -height / 2 + Math.abs(topSkew);
  const detailBottom = height / 2 - Math.abs(bottomSkew);
  if (surface === "sanded") {
    // Soft sheen band along one side of the face
    g.rect(
      -width / 2 + inset,
      detailTop + 2,
      Math.max(1.5, width / 4),
      detailBottom - detailTop - 4,
    );
    g.fill({ color: 0xffffff, alpha: 0.14 });
  }

  // How hard the wear map presses: full on unmilled stock, half once
  // milling has revealed the color, gone when the surface is smooth.
  const faceWear = !colorRevealed ? 1 : surface === "rough" ? 0.5 : 0;
  if (faceWear > 0) {
    const wear = root.addChild(new Graphics());
    wear.blendMode = "multiply";
    if (tint !== undefined) wear.tint = tint;
    const wearRng = seededRandom(`${region.seed}/wear`);
    const texture = Assets.get<Texture>(
      BOARD_ROUGHNESS_TEXTURES[
        Math.floor(wearRng() * BOARD_ROUGHNESS_TEXTURES.length)
      ],
    );
    const wsx =
      (PIXELS_PER_INCH * BOARD_FACE_SCAN_WIDTH_IN) / texture.source.width;
    const wsy =
      (PIXELS_PER_INCH * BOARD_FACE_SCAN_LENGTH_IN) / texture.source.height;
    const matrix = new Matrix(
      wsx,
      0,
      0,
      wsy,
      -region.v * PIXELS_PER_INCH - width / 2,
      -region.u * PIXELS_PER_INCH - height / 2,
    );
    wear.poly(silhouette.facePoly);
    wear.fill({ texture, matrix, textureSpace: "global", alpha: faceWear });
  }

  return root;
}

/**
 * The board's outline, shared by the base and wear layers: wavy
 * unjointed edges (seeded so they never shimmer) and miter skews.
 */
function boardSilhouette(board: BoardLook, seed: string) {
  const { jointedEdges, ends } = board;
  const width = board.width * PIXELS_PER_INCH;
  const height = board.length * PIXELS_PER_INCH;
  const rng = seededRandom(seed);

  // Mitered ends slant across the face by the angle's SIGNED run —
  // both end lines rise the same way for the same angle, so equal
  // angles draw parallel (a parallelogram) and opposite angles draw
  // the mirror pair (a frame rail), matching SignedMiterAngle's
  // convention. Clamped so two steep miters on a short, wide board
  // can't cross.
  const skewFor = (end: { kind: string; angle?: number } | undefined) => {
    if (end?.kind !== "mitered" || end.angle === undefined) {
      return 0;
    }
    const run = width * Math.tan((end.angle * Math.PI) / 180);
    return Math.sign(run) * Math.min(Math.abs(run), height * 0.45);
  };
  const topSkew = skewFor(ends?.left);
  const bottomSkew = skewFor(ends?.right);

  // Long edges: jointing snaps them straight, right edge first
  const amp = Math.min(1.5, width * 0.12);
  const rightAmp = jointedEdges >= 1 ? 0 : amp;
  const leftAmp = jointedEdges >= 2 ? 0 : amp;
  const edgePoints = (
    x: number,
    edgeAmp: number,
    yStart: number,
    yEnd: number,
  ): [number, number][] => {
    const segments = Math.max(2, Math.round(height / 16));
    const points: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const y = lerp(yStart, yEnd, i / segments);
      // Ends stay near-true so corners read as crosscut clean
      const jitter = i === 0 || i === segments ? edgeAmp * 0.3 : edgeAmp;
      points.push([x + (rng() * 2 - 1) * jitter, y]);
    }
    return points;
  };
  // Positive skew pulls back the left-edge corner at the top and the
  // right-edge corner at the bottom (and vice versa for negative), so
  // both end lines slant the same way for the same angle — equal
  // angles draw parallel, mirrored angles converge into the frame
  // rail's trapezoid (long edge left for -45/+45, right for +45/-45).
  const leftEdge = edgePoints(
    -width / 2,
    leftAmp,
    -height / 2 + Math.max(0, topSkew),
    height / 2 - Math.max(0, -bottomSkew),
  );
  const rightEdge = edgePoints(
    width / 2,
    rightAmp,
    -height / 2 + Math.max(0, -topSkew),
    height / 2 - Math.max(0, bottomSkew),
  );
  return {
    width,
    height,
    amp,
    topSkew,
    bottomSkew,
    facePoly: [...leftEdge, ...[...rightEdge].reverse()].flat(),
  };
}

/**
 * A board stood on its long edge, seen from above: the narrow edge face
 * (thickness × length) up, with a sliver of the board's wide face
 * showing down one side the way a standing rail leans its face into
 * view. Both surfaces are windows onto the board's own scans, placed by
 * its face region, so tipping a board up shows the same wood it showed
 * lying down. Same milled-state language as createBoardSprite:
 * unjointed edges weather gray, jointing lifts the veil.
 */
export function drawBoardOnEdge(
  g: Graphics,
  board: BoardLook,
  seed?: string,
): void {
  const {
    width: boardWidth,
    length: boardLength,
    thickness,
    species,
    surface,
    jointedFaces,
    jointedEdges,
    face,
  } = board;

  g.clear();
  const width = (thickness / 4) * PIXELS_PER_INCH;
  const height = boardLength * PIXELS_PER_INCH;
  // The face leans a hair into view beside the edge — enough to read
  // "standing board", never wider than the edge itself.
  const lean = Math.min(width * 0.8, 3);
  const pieceSeed =
    seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`;
  const region = face ?? defaultBoardFace(pieceSeed, boardLength, boardWidth);
  const art = woodArt(species, region.seed, thickness);

  // A standing board stands its whole width off the bench, and the
  // shadow says so — far wider than any lying board's
  drawContactShadow(g, -width / 2, -height / 2, width + lean, height, boardWidth, {
    alpha: 0.12,
  });

  // The upturned edge face
  g.rect(-width / 2, -height / 2, width, height);
  g.fill(edgeFill(art, region, boardWidth, thickness, -width / 2, -height / 2));

  // The sliver of wide face leaning into view beside it, shaded
  // because it tips away from the light
  g.rect(width / 2, -height / 2, lean, height);
  g.fill(faceFill(art, region, width / 2, -height / 2));
  g.rect(width / 2, -height / 2, lean, height);
  g.fill(TURNED_AWAY_SHADE);

  // Weathering lifts as milling reveals the wood, the same way it
  // does on the face-up board
  if (jointedEdges === 0) {
    g.rect(-width / 2, -height / 2, width, height);
    g.fill({ color: WEATHERED_GRAY, alpha: 0.5 });
  }
  if (jointedFaces === 0 && surface === "rough") {
    g.rect(width / 2, -height / 2, lean, height);
    g.fill({ color: WEATHERED_GRAY, alpha: 0.62 });
  }
}

/**
 * The narrow edge strip (thickness × length) the block plane's strokes
 * are constrained to, windowed onto the board's own wood — the old
 * `EdgeBandSprite`. Just the band: no shadow and no sliver of face
 * leaning in beside it (drawBoardOnEdge draws the standing board; this
 * draws the surface being worked). Unjointed it hides under the
 * weathered veil; `finished` shows the grain the plane brought up.
 */
export function drawBoardEdgeBand(
  g: Graphics,
  board: BoardLook,
  finished: boolean,
  seed?: string,
): void {
  const { width: boardWidth, length, thickness, species, face } = board;

  g.clear();
  const width = (thickness / 4) * PIXELS_PER_INCH;
  const height = length * PIXELS_PER_INCH;
  const pieceSeed = seed ?? `${species}-${boardWidth}x${length}x${thickness}`;
  const region = face ?? defaultBoardFace(pieceSeed, length, boardWidth);
  const art = woodArt(species, region.seed, thickness);

  g.rect(-width / 2, -height / 2, width, height);
  g.fill(edgeFill(art, region, boardWidth, thickness, -width / 2, -height / 2));
  if (!finished) {
    g.rect(-width / 2, -height / 2, width, height);
    g.fill({ color: WEATHERED_GRAY, alpha: 0.55 });
  }
}

/**
 * A board stood on its end, seen from above: nothing but the end grain —
 * the bare width × thickness cross-section a table leg presents while it
 * waits under a face-down top. A window onto a real crosscut photograph,
 * placed by the piece's seed so standing a board up doesn't reroll its
 * character, and shaded twice over because end grain drinks light.
 */
export function drawBoardOnEnd(
  g: Graphics,
  board: BoardLook,
  seed?: string,
): void {
  const { width: boardWidth, length, thickness, species } = board;

  g.clear();
  const w = boardWidth * PIXELS_PER_INCH;
  const h = (thickness / 4) * PIXELS_PER_INCH;
  const pieceSeed = seed ?? "on-end";

  // The tallest a board can stand — the shadow spreads to its cap
  drawContactShadow(g, -w / 2, -h / 2, w, h, length, { alpha: 0.12 });

  const art = woodArt(species, pieceSeed, thickness);
  g.rect(-w / 2, -h / 2, w, h);
  g.fill(endFill(art, pieceSeed, boardWidth, thickness / 4, -w / 2, -h / 2));

  // End grain sits in shade against the faces around it
  for (const _ of [0, 1]) {
    g.rect(-w / 2, -h / 2, w, h);
    g.fill(TURNED_AWAY_SHADE);
  }

  // a hairline rim so the block reads as a cut face, not a fill
  g.rect(-w / 2, -h / 2, w, h);
  g.stroke({ color: 0x000000, width: 1, alpha: 0.35 });
}
