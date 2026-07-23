import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { SheetGood } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { clamp, lerp } from "../../utils/mathUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import {
  colorBySheetGoodKind,
  osbFlakeColors,
} from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

/**
 * A sheet good's kind is drawn, not labeled:
 * - Plywood shows rotary-cut cathedral grain, and the grades tell on
 *   themselves — A comes clean, B wears football patches, C is knotty.
 * - OSB is a mosaic of pressed strands over a darker base; particle
 *   board is a coarse two-tone speckle; MDF is nearly featureless.
 * - The edge is the other tell: plywood's laminations stripe it, the
 *   chip boards crumble into speckle, MDF stays solid.
 * All irregularity is seeded so a sheet never shimmers between renders,
 * and defect counts scale with area so offcuts aren't over-decorated.
 */
export const SheetGoodSprite: React.FC<
  {
    sheet: Omit<SheetGood, "id" | "type">;
    /** Stable identity for procedural detail; pass the material id. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ sheet, seed, ...rest }) => {
  const { width: sheetWidth, length: sheetLength, thickness, kind } = sheet;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      // Unlike boards, a sheet's width AND length are both in feet
      const width = sheetWidth * INCHES_PER_FOOT * PIXELS_PER_INCH;
      const height = sheetLength * INCHES_PER_FOOT * PIXELS_PER_INCH;
      const depth = (thickness * PIXELS_PER_INCH) / 4;
      const rng = seededRandom(
        seed ?? `${kind}-${sheetWidth}x${sheetLength}x${thickness}`,
      );
      const { primary, secondary } = colorBySheetGoodKind[kind];
      const squareFeet = sheetWidth * sheetLength;

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

      // main face — OSB's base darkens so the gaps between strands read
      // as shadow
      g.rect(-width / 2, -height / 2, width, height);
      g.fill(kind === "osb" ? mixColors(primary, 0x000000, 0.25) : primary);

      // Expected count realized so fractional rates work on small sheets
      const countFor = (expected: number) =>
        Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);

      if (kind === "osb") {
        // Pressed strands: rotated slivers in varied tans, corners
        // clamped to the face so border strands read as trimmed
        const flakes = Math.min(1500, Math.round((width * height) / 30));
        for (let i = 0; i < flakes; i++) {
          const cx = -width / 2 + rng() * width;
          const cy = -height / 2 + rng() * height;
          const half = 3 + rng() * 4;
          const halfW = 1 + rng() * 1.5;
          const angle = rng() * Math.PI;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const corners: [number, number][] = [
            [cx + cos * half - sin * halfW, cy + sin * half + cos * halfW],
            [cx + cos * half + sin * halfW, cy + sin * half - cos * halfW],
            [cx - cos * half + sin * halfW, cy - sin * half - cos * halfW],
            [cx - cos * half - sin * halfW, cy - sin * half + cos * halfW],
          ].map(([x, y]) => [
            clamp(x, -width / 2, width / 2),
            clamp(y, -height / 2, height / 2),
          ]);
          g.poly(corners.flat());
          g.fill({
            color: osbFlakeColors[Math.floor(rng() * osbFlakeColors.length)],
            alpha: 0.9,
          });
        }
      } else if (kind === "particleBoard") {
        // Coarse chips pressed flat: a dense two-tone speckle
        const chips = Math.round((width * height) / 30);
        for (let i = 0; i < chips; i++) {
          const chipW = 1 + rng() * 1.8;
          const chipH = 1 + rng() * 1.8;
          const x = lerp(-width / 2, width / 2 - chipW, rng());
          const y = lerp(-height / 2, height / 2 - chipH, rng());
          g.rect(x, y, chipW, chipH);
          g.fill({
            color:
              rng() < 0.5
                ? mixColors(primary, secondary, 0.8)
                : mixColors(primary, 0xffffff, 0.5),
            alpha: 0.5,
          });
        }
      } else if (kind === "mdf") {
        // Uniform fiber: nothing to see but a faint, sparse fleck
        const flecks = Math.round((width * height) / 160);
        for (let i = 0; i < flecks; i++) {
          const x = lerp(-width / 2 + 1, width / 2 - 1, rng());
          const y = lerp(-height / 2 + 1, height / 2 - 1, rng());
          g.circle(x, y, 0.5 + rng() * 0.4);
          g.fill({
            color: rng() < 0.5 ? secondary : mixColors(primary, 0xffffff, 0.25),
            alpha: 0.25,
          });
        }
      } else {
        // Rotary-cut veneer: cathedrals — nested ovals stretched along
        // the grain — over sparse straight grain lines
        const inset = 3;
        const grainLines = Math.max(2, Math.round(width / 24));
        for (let i = 0; i < grainLines; i++) {
          const x =
            lerp(
              -width / 2 + inset,
              width / 2 - inset,
              (i + 0.5) / grainLines,
            ) +
            (rng() * 2 - 1) * 3;
          const wander = (rng() * 2 - 1) * 2;
          g.moveTo(x, -height / 2 + 2);
          g.bezierCurveTo(
            x + wander,
            -height / 6,
            x - wander,
            height / 6,
            x + (rng() * 2 - 1) * 2,
            height / 2 - 2,
          );
          g.stroke({ width: 1, color: secondary, alpha: 0.2 });
        }
        // Each cathedral gets its own horizontal band so they spread
        // across the sheet instead of clumping
        const cathedrals = Math.max(1, Math.round(squareFeet / 6));
        for (let i = 0; i < cathedrals; i++) {
          const rx = Math.min(width * 0.18, 14) * (0.6 + rng() * 0.4);
          const ry = Math.min(rx * (2.5 + rng() * 1.5), height / 2 - inset);
          const bandStart = -width / 2 + (width / cathedrals) * i;
          const cx = clamp(
            lerp(bandStart, bandStart + width / cathedrals, rng()),
            -width / 2 + rx + inset,
            width / 2 - rx - inset,
          );
          const cy = lerp(
            -height / 2 + ry + inset,
            height / 2 - ry - inset,
            rng(),
          );
          const rings = 3 + Math.floor(rng() * 2);
          for (let ring = 1; ring <= rings; ring++) {
            g.ellipse(cx, cy, rx * (ring / rings), ry * (ring / rings));
            g.stroke({ width: 1, color: secondary, alpha: 0.3 });
          }
        }

        if (kind === "plywoodB") {
          // Football patches where the mill cut defects out of the face
          const patches = countFor(squareFeet / 10);
          for (let i = 0; i < patches; i++) {
            const rx = 2 + rng() * 1.5;
            const ry = rx * (2.2 + rng());
            if (ry + inset > height / 2 || rx + inset > width / 2) {
              continue;
            }
            const cx = lerp(
              -width / 2 + rx + inset,
              width / 2 - rx - inset,
              rng(),
            );
            const cy = lerp(
              -height / 2 + ry + inset,
              height / 2 - ry - inset,
              rng(),
            );
            g.ellipse(cx, cy, rx, ry);
            g.fill(mixColors(primary, secondary, 0.45));
            g.ellipse(cx, cy, rx, ry);
            g.stroke({ width: 1, color: secondary, alpha: 0.6 });
          }
        }
        if (kind === "plywoodC") {
          // Dark knots the cheap grade never bothered to patch
          const knots = countFor(squareFeet / 4);
          for (let i = 0; i < knots; i++) {
            const rx = 1 + rng() * 1.5;
            const ry = rx * (1 + rng() * 0.6);
            if (ry + inset > height / 2 || rx + inset > width / 2) {
              continue;
            }
            const cx = lerp(
              -width / 2 + rx + inset,
              width / 2 - rx - inset,
              rng(),
            );
            const cy = lerp(
              -height / 2 + ry + inset,
              height / 2 - ry - inset,
              rng(),
            );
            g.ellipse(cx, cy, rx, ry);
            g.fill(mixColors(secondary, 0x000000, 0.45));
            g.ellipse(cx, cy, rx + 0.5, ry + 0.5);
            g.stroke({
              width: 1,
              color: mixColors(secondary, 0x000000, 0.2),
              alpha: 0.5,
            });
          }
        }
      }

      // edge face: laminations stripe plywood, chip boards crumble into
      // speckle, MDF stays solid
      const isPlywood = kind.startsWith("plywood");
      g.rect(width / 2, -height / 2, depth, height);
      g.fill(isPlywood ? mixColors(primary, 0x000000, 0.15) : secondary);
      if (isPlywood) {
        for (let i = 1; i < depth; i += 2) {
          g.rect(width / 2 + i, -height / 2, 1, height);
          g.fill(mixColors(secondary, 0x000000, 0.25));
        }
      } else if (kind !== "mdf") {
        const dots = Math.round(height / 4);
        for (let i = 0; i < dots; i++) {
          g.rect(
            width / 2 + rng() * Math.max(0, depth - 1),
            -height / 2 + rng() * (height - 1),
            1,
            1,
          );
          g.fill({ color: mixColors(secondary, 0x000000, 0.3), alpha: 0.6 });
        }
      }
    },
    [sheetWidth, sheetLength, thickness, kind, seed],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
