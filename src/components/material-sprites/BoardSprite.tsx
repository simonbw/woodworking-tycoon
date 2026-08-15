import { Assets, Graphics, Matrix, Texture } from "pixi.js";
import React, { useCallback, useMemo } from "react";
import {
  Board,
  BOARD_FACE_SCAN_LENGTH_IN,
  BOARD_FACE_SCAN_WIDTH_IN,
  defaultBoardFace,
} from "../../game/Materials";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import {
  BOARD_FACE_TEXTURES,
  BOARD_ROUGHNESS_TEXTURES,
} from "./boardFaceTextures";

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

/**
 * A board's milled state is drawn, not labeled:
 * - Species with scan art (boardFaceTextures.ts) wear a window of a real
 *   plank photograph, placed by the board's face region so a cut piece
 *   keeps the very grain it was cut with; the rest draw the procedural
 *   face. The edge face works the same way from the edge strips.
 * - Roughness is real too: a grayscale wear map multiplies over the face
 *   (white is clean wood, dark is scuffs and saw marks), windowed by the
 *   same region so a board's scars survive its cuts. Milling fades it —
 *   full strength on unmilled stock, half once the color is revealed,
 *   gone when the surface is smooth.
 * - Unjointed faces on rough stock additionally hide under a
 *   weathered-gray veil; jointing (or sanding) lifts it and the same
 *   grain comes up in color.
 * - Unjointed long edges are wavy; jointing snaps them straight (right
 *   edge first — it carries the visible edge face).
 * - Sanded adds a lighter tone and a sheen band.
 * - Mitered ends draw as diagonals: the left end is the sprite's top, the
 *   right end its bottom, and the angle sets the diagonal's run.
 * All irregularity is seeded so a board never shimmers between renders.
 */
export const BoardSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
    /** Stable identity for procedural detail; pass the material id. */
    seed?: string;
  } & React.ComponentProps<"pixiContainer">
> = ({ board, seed, ...rest }) => {
  const {
    width: boardWidth,
    length: boardLength,
    thickness,
    species,
    surface,
    jointedFaces,
    jointedEdges,
    ends,
    face,
  } = board;

  const fallbackSeed =
    seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`;
  const colorRevealed = jointedFaces > 0 || surface !== "rough";

  // The board's window onto its source plank (inches on the canonical
  // scan rectangle) — drives the face art AND the wear map, so both
  // survive a cut together.
  const region = useMemo(
    () => face ?? defaultBoardFace(fallbackSeed, boardLength, boardWidth),
    [face, fallbackSeed, boardLength, boardWidth],
  );

  /**
   * The board's outline, shared by the base and wear layers: wavy
   * unjointed edges (seeded so they never shimmer), miter skews, and the
   * edge face's extrusion.
   */
  const silhouette = useMemo(() => {
    const width = boardWidth * PIXELS_PER_INCH;
    const height = boardLength * PIXELS_PER_INCH;
    const depth = (thickness * PIXELS_PER_INCH) / 4;
    const rng = seededRandom(fallbackSeed);

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
      depth,
      amp,
      topSkew,
      bottomSkew,
      facePoly: [...leftEdge, ...[...rightEdge].reverse()].flat(),
      edgePoly: [
        ...rightEdge,
        ...[...rightEdge].reverse().map(([x, y]) => [x + depth, y]),
      ].flat(),
    };
  }, [boardWidth, boardLength, thickness, jointedEdges, ends, fallbackSeed]);

  // How hard the wear map presses: full on unmilled stock, half once
  // milling has revealed the color, gone when the surface is smooth.
  // Edges wear until they're jointed.
  const faceWear = !colorRevealed ? 1 : surface === "rough" ? 0.5 : 0;
  const edgeWear = jointedEdges === 0 ? 0.8 : 0;

  const drawBase = useCallback(
    (g: Graphics) => {
      g.clear();
      const { width, height, depth, amp, topSkew, bottomSkew } = silhouette;

      const { primary, secondary } = colorBySpecies[species];
      const faceColor = !colorRevealed
        ? mixColors(primary, WEATHERED_GRAY, 0.62)
        : surface === "sanded"
          ? mixColors(primary, 0xffffff, 0.1)
          : colorToNumber(primary);
      const edgeColor =
        jointedEdges > 0
          ? colorToNumber(secondary)
          : mixColors(secondary, WEATHERED_GRAY, 0.5);

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

      const art = BOARD_FACE_TEXTURES[species];
      if (art) {
        // The seed picks which scan of the library (an independent
        // stream, so the placement draws stay untouched)
        const artRng = seededRandom(`${region.seed}/art`);
        const faceTexture = Assets.get<Texture>(
          art.faces[Math.floor(artRng() * art.faces.length)],
        );
        const edgeTexture = Assets.get<Texture>(
          art.edges[Math.floor(artRng() * art.edges.length)],
        );
        const edgeV =
          artRng() * Math.max(0, art.edgeSpanInches - thickness / 4);

        // The matrix maps texture pixels into local space (PIXI inverts
        // it to build UVs): image x is across the plank, image y along
        // the grain, drawn top-to-bottom like the board's length.
        const sx =
          (PIXELS_PER_INCH * BOARD_FACE_SCAN_WIDTH_IN) /
          faceTexture.source.width;
        const sy =
          (PIXELS_PER_INCH * BOARD_FACE_SCAN_LENGTH_IN) /
          faceTexture.source.height;
        g.poly(silhouette.facePoly);
        g.fill({
          texture: faceTexture,
          matrix: new Matrix(
            sx,
            0,
            0,
            sy,
            -region.v * PIXELS_PER_INCH - width / 2,
            -region.u * PIXELS_PER_INCH - height / 2,
          ),
          textureSpace: "global",
        });

        // The edge strip shares the face's lengthwise position, so a
        // cut board's edge streaks continue across the seam too.
        const esx =
          (PIXELS_PER_INCH * art.edgeSpanInches) / edgeTexture.source.width;
        const esy =
          (PIXELS_PER_INCH * BOARD_FACE_SCAN_LENGTH_IN) /
          edgeTexture.source.height;
        g.poly(silhouette.edgePoly);
        g.fill({
          texture: edgeTexture,
          matrix: new Matrix(
            esx,
            0,
            0,
            esy,
            width / 2 - edgeV * PIXELS_PER_INCH,
            -region.u * PIXELS_PER_INCH - height / 2,
          ),
          textureSpace: "global",
        });

        // Weathering and finish read as veils over the real grain: the
        // gray lifts when milling reveals the wood, sanding brightens it
        if (!colorRevealed) {
          g.poly(silhouette.facePoly);
          g.fill({ color: WEATHERED_GRAY, alpha: 0.62 });
        } else if (surface === "sanded") {
          g.poly(silhouette.facePoly);
          g.fill({ color: 0xffffff, alpha: 0.1 });
        }
        if (jointedEdges === 0) {
          g.poly(silhouette.edgePoly);
          g.fill({ color: WEATHERED_GRAY, alpha: 0.5 });
        }
      } else {
        // main face: down the left edge, back up the right
        g.poly(silhouette.facePoly);
        g.fill(faceColor);

        // edge face: the right edge extruded by the board's thickness
        g.poly(silhouette.edgePoly);
        g.fill(edgeColor);
      }

      const inset = amp + 1.5;
      // Surface detail stays inside the mitered silhouette
      const detailTop = -height / 2 + Math.abs(topSkew);
      const detailBottom = height / 2 - Math.abs(bottomSkew);
      if (surface !== "rough" && !art) {
        // Long grain lines down the length — the scans carry their own,
        // and rough faces leave the talking to the wear map
        const rng = seededRandom(`${fallbackSeed}/grain`);
        const grainLines = Math.max(1, Math.round(width / 8));
        for (let i = 0; i < grainLines; i++) {
          const x =
            lerp(
              -width / 2 + inset,
              width / 2 - inset,
              (i + 0.5) / grainLines,
            ) +
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
    },
    [
      silhouette,
      region,
      species,
      surface,
      colorRevealed,
      jointedEdges,
      thickness,
      fallbackSeed,
    ],
  );

  const drawWear = useCallback(
    (g: Graphics) => {
      g.clear();
      const { width, height } = silhouette;
      const wearRng = seededRandom(`${region.seed}/wear`);
      const texture = Assets.get<Texture>(
        BOARD_ROUGHNESS_TEXTURES[
          Math.floor(wearRng() * BOARD_ROUGHNESS_TEXTURES.length)
        ],
      );
      const sx =
        (PIXELS_PER_INCH * BOARD_FACE_SCAN_WIDTH_IN) / texture.source.width;
      const sy =
        (PIXELS_PER_INCH * BOARD_FACE_SCAN_LENGTH_IN) / texture.source.height;
      const matrix = new Matrix(
        sx,
        0,
        0,
        sy,
        -region.v * PIXELS_PER_INCH - width / 2,
        -region.u * PIXELS_PER_INCH - height / 2,
      );
      if (faceWear > 0) {
        g.poly(silhouette.facePoly);
        g.fill({ texture, matrix, textureSpace: "global", alpha: faceWear });
      }
      if (edgeWear > 0) {
        // Same window as the face — the wear wraps the corner
        g.poly(silhouette.edgePoly);
        g.fill({ texture, matrix, textureSpace: "global", alpha: edgeWear });
      }
    },
    [silhouette, region, faceWear, edgeWear],
  );

  return (
    <pixiContainer {...omitUndefined(rest)}>
      <pixiGraphics draw={drawBase} />
      {(faceWear > 0 || edgeWear > 0) && (
        <pixiGraphics draw={drawWear} blendMode="multiply" />
      )}
    </pixiContainer>
  );
};
