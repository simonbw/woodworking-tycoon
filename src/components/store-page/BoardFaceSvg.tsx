import React, { useMemo } from "react";
import { Board } from "../../game/Materials";
import { colorToCss, mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
import { seededRandom } from "../../utils/randUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

/** The gray of weathered, unmilled lumber — species color hides under it. */
const WEATHERED_GRAY = 0x9a9186;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A board lying on its side, drawn with the same visual rules as the
 * shop-floor BoardSprite so store stock looks like what lands in the shop:
 * - Unjointed faces on rough stock render weathered gray; milling reveals
 *   the species color.
 * - Unjointed long edges are wavy; jointing snaps them straight (bottom
 *   edge first — it carries the visible edge face).
 * - Rough surface shows cross-grain saw marks, smooth shows long grain
 *   lines, sanded adds a lighter tone and a sheen band.
 * All irregularity is seeded so a board never shimmers between renders.
 *
 * SVG rather than PIXI so a whole aisle of these costs nothing. Ends are
 * always drawn square — store stock is never mitered.
 */
export const BoardFaceSvg: React.FC<{
  board: Omit<Board, "id" | "type">;
  /** Stable identity for procedural detail; defaults to species + dims. */
  seed?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ board, seed, className, style }) => {
  const {
    width: boardWidth,
    length: boardLength,
    thickness,
    species,
    surface,
    jointedFaces,
    jointedEdges,
  } = board;

  const drawing = useMemo(() => {
    const length = boardLength * INCHES_PER_FOOT * PIXELS_PER_INCH;
    const width = boardWidth * PIXELS_PER_INCH;
    const depth = (thickness * PIXELS_PER_INCH) / 4;
    const rng = seededRandom(
      seed ?? `${species}-${boardWidth}x${boardLength}x${thickness}`,
    );

    const { primary, secondary } = colorBySpecies[species];
    const colorRevealed = jointedFaces > 0 || surface !== "rough";
    const faceColor = !colorRevealed
      ? colorToCss(mixColors(primary, WEATHERED_GRAY, 0.62))
      : surface === "sanded"
        ? colorToCss(mixColors(primary, 0xffffff, 0.1))
        : primary;
    const edgeColor =
      jointedEdges > 0
        ? secondary
        : colorToCss(mixColors(secondary, WEATHERED_GRAY, 0.5));

    // Long edges: jointing snaps them straight, bottom edge first
    const amp = Math.min(1.5, width * 0.12);
    const bottomAmp = jointedEdges >= 1 ? 0 : amp;
    const topAmp = jointedEdges >= 2 ? 0 : amp;
    const edgePoints = (y: number, edgeAmp: number): [number, number][] => {
      const segments = Math.max(2, Math.round(length / 16));
      const points: [number, number][] = [];
      for (let i = 0; i <= segments; i++) {
        const x = lerp(0, length, i / segments);
        // Ends stay near-true so corners read as crosscut clean
        const jitter = i === 0 || i === segments ? edgeAmp * 0.3 : edgeAmp;
        points.push([x, y + (rng() * 2 - 1) * jitter]);
      }
      return points;
    };
    const topEdge = edgePoints(0, topAmp);
    const bottomEdge = edgePoints(width, bottomAmp);

    const toPoints = (pts: [number, number][]) =>
      pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");

    // main face: along the top edge, back along the bottom
    const facePoints = toPoints([...topEdge, ...[...bottomEdge].reverse()]);
    // edge face: the bottom edge extruded by the board's thickness
    const edgeFacePoints = toPoints([
      ...bottomEdge,
      ...[...bottomEdge].reverse().map(([x, y]): [number, number] => [
        x,
        y + depth,
      ]),
    ]);

    const inset = amp + 1.5;
    const marks: string[] = [];
    if (surface === "rough") {
      // Cross-grain saw marks, fainter once the face is milled clean
      let x = 3 + rng() * 6;
      while (x < length - 3) {
        const slope = (rng() * 2 - 1) * 1.5;
        marks.push(
          `M ${r2(x - slope)} ${r2(inset)} L ${r2(x + slope)} ${r2(width - inset)}`,
        );
        x += 5 + rng() * 8;
      }
    } else {
      // Long grain lines down the length
      const grainLines = Math.max(1, Math.round(width / 8));
      for (let i = 0; i < grainLines; i++) {
        const y =
          lerp(inset, width - inset, (i + 0.5) / grainLines) +
          (rng() * 2 - 1) * 1.5;
        const wander = (rng() * 2 - 1) * 1.2;
        marks.push(
          `M 2 ${r2(y)} C ${r2(length / 3)} ${r2(y + wander)}, ${r2((length * 2) / 3)} ${r2(y - wander)}, ${r2(length - 2)} ${r2(y + (rng() * 2 - 1) * 1.2)}`,
        );
      }
    }

    // Pad the viewBox so edge jitter never clips
    const pad = amp + 1;
    return {
      viewBox: `0 ${-pad} ${length} ${width + depth + 2 * pad}`,
      facePoints,
      edgeFacePoints,
      faceColor,
      edgeColor,
      secondary,
      markAlpha:
        surface === "rough" ? (colorRevealed ? 0.07 : 0.13) : undefined,
      marks,
      sheen:
        surface === "sanded"
          ? { x: 2, y: inset, w: length - 4, h: Math.max(1.5, width / 4) }
          : undefined,
    };
  }, [boardWidth, boardLength, thickness, species, surface, jointedFaces, jointedEdges, seed]);

  return (
    <svg
      viewBox={drawing.viewBox}
      className={className}
      style={style}
      preserveAspectRatio="xMinYMid meet"
      aria-hidden
    >
      <polygon points={drawing.facePoints} fill={drawing.faceColor} />
      <polygon points={drawing.edgeFacePoints} fill={drawing.edgeColor} />
      {drawing.marks.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={drawing.markAlpha !== undefined ? "#000000" : drawing.secondary}
          strokeOpacity={drawing.markAlpha ?? 0.35}
          strokeWidth={1}
        />
      ))}
      {drawing.sheen && (
        <rect
          x={drawing.sheen.x}
          y={drawing.sheen.y}
          width={drawing.sheen.w}
          height={drawing.sheen.h}
          fill="#ffffff"
          fillOpacity={0.14}
        />
      )}
    </svg>
  );
};
