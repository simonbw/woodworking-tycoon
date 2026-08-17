import { Graphics } from "pixi.js";
import { colorBySpecies } from "../colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-scale";
import { Board } from "../../game/Materials";
import { clipArcToRect } from "../../utils/arcClipping";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
import { seededRandom } from "../../utils/randUtils";

/**
 * The board renderers — the old BoardSprite / BoardOnEdgeSprite /
 * BoardOnEndSprite draw callbacks as plain functions over a `Graphics`.
 * Same drawing, no React: callers hand in the Graphics (usually via
 * `createMaterialSprite`) and own its lifecycle.
 */

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

/** The board data the renderers read — everything but identity. */
export type BoardLook = Omit<Board, "id" | "type">;

/**
 * A board's milled state is drawn, not labeled:
 * - Unjointed faces on rough stock render weathered gray; jointing (or
 *   sanding) reveals the species color.
 * - Unjointed long edges are wavy; jointing snaps them straight (right
 *   edge first — it carries the visible edge face).
 * - Rough surface shows cross-grain saw marks, smooth shows long grain
 *   lines, sanded adds a lighter tone and a sheen band.
 * - Mitered ends draw as diagonals: the left end is the sprite's top, the
 *   right end its bottom, and the angle sets the diagonal's run.
 * All irregularity is seeded so a board never shimmers between renders.
 */
export function drawBoard(g: Graphics, board: BoardLook, seed?: string): void {
  const {
    width: boardWidth,
    length: boardLength,
    thickness,
    species,
    surface,
    jointedFaces,
    jointedEdges,
    ends,
  } = board;

  g.clear();
  const width = boardWidth * PIXELS_PER_INCH;
  const height = boardLength * PIXELS_PER_INCH;
  const depth = (thickness * PIXELS_PER_INCH) / 4;
  const rng = seededRandom(
    seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`,
  );

  const { primary, secondary } = colorBySpecies[species];
  const colorRevealed = jointedFaces > 0 || surface !== "rough";
  const faceColor = !colorRevealed
    ? mixColors(primary, WEATHERED_GRAY, 0.62)
    : surface === "sanded"
      ? mixColors(primary, 0xffffff, 0.1)
      : colorToNumber(primary);
  const edgeColor =
    jointedEdges > 0
      ? colorToNumber(secondary)
      : mixColors(secondary, WEATHERED_GRAY, 0.5);

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

  // shadow
  for (const shadowWidth of [1, 2]) {
    g.rect(
      -width / 2 - shadowWidth,
      -height / 2 - shadowWidth,
      width + depth + shadowWidth * 2,
      height + shadowWidth * 2,
    );
    g.fill({ color: 0x000000, alpha: 0.1 });
  }

  // main face: down the left edge, back up the right
  g.poly([...leftEdge, ...[...rightEdge].reverse()].flat());
  g.fill(faceColor);

  // edge face: the right edge extruded by the board's thickness
  g.poly(
    [
      ...rightEdge,
      ...[...rightEdge].reverse().map(([x, y]) => [x + depth, y]),
    ].flat(),
  );
  g.fill(edgeColor);

  const inset = amp + 1.5;
  // Surface detail stays inside the mitered silhouette
  const detailTop = -height / 2 + Math.abs(topSkew);
  const detailBottom = height / 2 - Math.abs(bottomSkew);
  if (surface === "rough") {
    // Cross-grain saw marks, fainter once the face is milled clean
    const markAlpha = colorRevealed ? 0.07 : 0.13;
    let y = detailTop + 3 + rng() * 6;
    while (y < detailBottom - 3) {
      const slope = (rng() * 2 - 1) * 1.5;
      g.moveTo(-width / 2 + inset, y - slope);
      g.lineTo(width / 2 - inset, y + slope);
      g.stroke({ width: 1, color: 0x000000, alpha: markAlpha });
      y += 5 + rng() * 8;
    }
  } else {
    // Long grain lines down the length
    const grainLines = Math.max(1, Math.round(width / 8));
    for (let i = 0; i < grainLines; i++) {
      const x =
        lerp(-width / 2 + inset, width / 2 - inset, (i + 0.5) / grainLines) +
        (rng() * 2 - 1) * 1.5;
      const wander = (rng() * 2 - 1) * 1.2;
      g.moveTo(x, detailTop + 2);
      g.bezierCurveTo(
        x + wander,
        -height / 6,
        x - wander,
        height / 6,
        x + (rng() * 2 - 1) * 1.2,
        detailBottom - 2,
      );
      g.stroke({ width: 1, color: secondary, alpha: 0.35 });
    }
  }

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
}

/**
 * A board stood on its long edge, seen from above: the narrow edge face
 * (thickness × length) up, with a sliver of the board's wide face
 * showing down one side the way a standing rail leans its face into
 * view. Same milled-state language as drawBoard — unjointed edges
 * weather gray, jointing reveals the species' edge color — and the same
 * seeding, so tipping a board up doesn't reroll its character.
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
  } = board;

  g.clear();
  const width = (thickness / 4) * PIXELS_PER_INCH;
  const height = boardLength * PIXELS_PER_INCH;
  // The face leans a hair into view beside the edge — enough to read
  // "standing board", never wider than the edge itself.
  const lean = Math.min(width * 0.8, 3);
  const rng = seededRandom(
    seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`,
  );

  const { primary, secondary } = colorBySpecies[species];
  const edgeColor =
    jointedEdges > 0
      ? colorToNumber(secondary)
      : mixColors(secondary, WEATHERED_GRAY, 0.5);
  const faceRevealed = jointedFaces > 0 || surface !== "rough";
  const faceColor = faceRevealed
    ? mixColors(primary, 0x000000, 0.25)
    : mixColors(mixColors(primary, WEATHERED_GRAY, 0.62), 0x000000, 0.25);

  // A standing board throws a longer shadow than a lying one
  for (const shadowWidth of [1.5, 3]) {
    g.rect(
      -width / 2 - shadowWidth,
      -height / 2 - shadowWidth,
      width + lean + shadowWidth * 2,
      height + shadowWidth * 2,
    );
    g.fill({ color: 0x000000, alpha: 0.12 });
  }

  // The upturned edge face
  g.rect(-width / 2, -height / 2, width, height).fill(edgeColor);
  // The shaded sliver of wide face leaning into view
  g.rect(width / 2, -height / 2, lean, height).fill(faceColor);

  if (jointedEdges > 0) {
    // Straightened: crisp grain lines run the length
    const lines = Math.max(1, Math.round(width / 3));
    for (let i = 0; i < lines; i++) {
      const x =
        -width / 2 +
        (width * (i + 0.5)) / lines +
        (rng() * 2 - 1) * (width * 0.1);
      g.moveTo(x, -height / 2 + 2)
        .lineTo(x + (rng() * 2 - 1) * 1.5, height / 2 - 2)
        .stroke({
          width: 0.8,
          color: mixColors(secondary, 0x000000, 0.25),
          alpha: 0.45,
        });
    }
  } else {
    // Rough: cross marks where the mill's saw chattered
    let y = -height / 2 + 3 + rng() * 5;
    while (y < height / 2 - 3) {
      g.moveTo(-width / 2, y)
        .lineTo(width / 2, y + (rng() * 2 - 1) * 2)
        .stroke({ width: 1, color: 0x000000, alpha: 0.12 });
      y += 5 + rng() * 8;
    }
  }
}

/**
 * A board stood on its end, seen from above: nothing but the end grain —
 * the bare width × thickness cross-section a table leg presents while it
 * waits under a face-down top. Drawn darker than the face (end grain
 * drinks light) with a few growth arcs seeded off the piece's id, so
 * standing a board up doesn't reroll its character.
 *
 * The arcs are rings around a pith sitting off the face, the way a flatsawn
 * board's end reads, and they are clipped to the cut face — a ring only
 * exists where the saw exposed it.
 */
export function drawBoardOnEnd(
  g: Graphics,
  board: BoardLook,
  seed?: string,
): void {
  const { width: boardWidth, thickness, species } = board;

  g.clear();
  const w = boardWidth * PIXELS_PER_INCH;
  const h = (thickness / 4) * PIXELS_PER_INCH;
  const rand = seededRandom(seed ?? "on-end");
  const face = colorBySpecies[species].primary;
  const endGrain = colorToNumber(mixColors(face, 0x000000, 0.25));
  const ring = colorToNumber(mixColors(face, 0x000000, 0.45));
  const cut = { x: -w / 2, y: -h / 2, width: w, height: h };

  // shadow: the standing piece throws a slightly wider foot
  for (const spread of [1, 2]) {
    g.rect(-w / 2 - spread, -h / 2 - spread, w + spread * 2, h + spread * 2);
    g.fill({ color: 0x000000, alpha: 0.12 });
  }

  g.rect(-w / 2, -h / 2, w, h);
  g.fill(endGrain);

  // Growth rings around a pith below the face, spaced so each one actually
  // crosses the cut, then trimmed to the piece.
  const pithX = (rand() - 0.5) * w * 2;
  const pithY = h / 2 + w * (0.6 + rand() * 1.0);
  const ringCount = Math.max(2, Math.min(5, Math.round(w / 6)));
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 0.5 + (rand() - 0.5) * 0.5) / ringCount;
    const crossingX = -w / 2 + t * w;
    const radius = Math.hypot(crossingX - pithX, pithY);
    const spans = clipArcToRect(
      pithX,
      pithY,
      radius,
      Math.PI,
      Math.PI * 2,
      cut,
    );
    for (const [from, to] of spans) {
      g.moveTo(
        pithX + radius * Math.cos(from),
        pithY + radius * Math.sin(from),
      );
      g.arc(pithX, pithY, radius, from, to);
      g.stroke({ color: ring, width: 1, alpha: 0.5 });
    }
  }

  // a hairline rim so the block reads as a cut face, not a fill
  g.rect(-w / 2, -h / 2, w, h);
  g.stroke({ color: ring, width: 1, alpha: 0.7 });
}
