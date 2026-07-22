import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

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
export const BoardSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
    /** Stable identity for procedural detail; pass the material id. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
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
  } = board;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const width = boardWidth * PIXELS_PER_INCH;
      const height = boardLength * PIXELS_PER_INCH * INCHES_PER_FOOT;
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
      // each end line rises left-to-right by its angle's signed run.
      const leftEdge = edgePoints(
        -width / 2,
        leftAmp,
        -height / 2 + Math.max(0, topSkew),
        height / 2 - Math.max(0, bottomSkew),
      );
      const rightEdge = edgePoints(
        width / 2,
        rightAmp,
        -height / 2 + Math.max(0, -topSkew),
        height / 2 - Math.max(0, -bottomSkew),
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
      boardWidth,
      boardLength,
      thickness,
      species,
      surface,
      jointedFaces,
      jointedEdges,
      ends,
      seed,
    ],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
