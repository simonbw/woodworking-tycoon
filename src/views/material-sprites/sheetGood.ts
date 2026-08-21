import { Assets, Graphics, Matrix, Texture } from "pixi.js";
import { colorBySheetGoodKind, osbFlakeColors } from "../colorBySpecies";
import { drawContactShadow } from "./contactShadow";
import { PIXELS_PER_INCH } from "../shop-scale";
import { SheetGood } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { clamp, lerp } from "../../utils/mathUtils";
import { seededRandom } from "../../utils/randUtils";
import { SHEET_FACE_TEXTURES } from "./sheetFaceTextures";

/** The sheet data the renderer reads — everything but identity. */
export type SheetGoodLook = Omit<SheetGood, "id" | "type">;

/**
 * A sheet good's face is real art: a seamless photo tile per kind
 * (sheetFaceTextures.ts), windowed by the piece's face region so a cut
 * piece shows the very stretch of veneer it had before the cut — the
 * fill matrix is the rendering half of the SheetFaceRegion contract
 * (see sheetFacePoint in sheet-helpers.ts, which the matrix mirrors).
 * Every kind has art now; the procedural faces below stay as the
 * fallback for any future kind that ships before its texture.
 *
 * Seen from above, a sheet is nothing but its face — thickness reads
 * through the contact shadow's spread, not a drawn edge. Seeded, so a
 * sheet never shimmers between renders.
 * The old SheetGoodSprite's draw callback as a plain function.
 */
export function drawSheetGood(
  g: Graphics,
  sheet: SheetGoodLook,
  seed?: string,
): void {
  const {
    width: sheetWidth,
    length: sheetLength,
    thickness,
    kind,
    face,
  } = sheet;

  g.clear();
  // Unlike boards, a sheet's width AND length are both in inches
  const width = sheetWidth * PIXELS_PER_INCH;
  const height = sheetLength * PIXELS_PER_INCH;
  const fallbackSeed =
    seed ?? `${kind}-${sheetWidth}x${sheetLength}x${thickness}`;
  const rng = seededRandom(fallbackSeed);
  const { primary, secondary } = colorBySheetGoodKind[kind];
  const squareFeet = sheetWidth * sheetLength;

  drawContactShadow(g, -width / 2, -height / 2, width, height, thickness / 4);

  const faceArt = SHEET_FACE_TEXTURES[kind];
  if (faceArt) {
    // The piece's window onto its source sheet's face, in inches
    // (virgin default inlined — the renderer has no id to seed by
    // beyond the seed argument). The source sheet itself sits at a
    // seeded spot on the endless tiling art, so two sheets of one
    // kind don't share a veneer.
    const region = face ?? {
      seed: fallbackSeed,
      u: 0,
      v: 0,
      rotated: false,
    };
    const texture = Assets.get<Texture>(faceArt.src);
    const baseRng = seededRandom(region.seed);
    const uPx = (region.u + baseRng() * faceArt.spanInches) * PIXELS_PER_INCH;
    const vPx = (region.v + baseRng() * faceArt.spanInches) * PIXELS_PER_INCH;
    // Local px per texture px; the matrix maps texture pixels into
    // this sprite's local space (PIXI inverts it to build UVs). The
    // rotated case transposes the axes: image y is the veneer's
    // grain (the source's u/length axis), image x runs across.
    const scale = (PIXELS_PER_INCH * faceArt.spanInches) / texture.source.width;
    const matrix = region.rotated
      ? new Matrix(0, scale, scale, 0, -uPx - width / 2, -vPx - height / 2)
      : new Matrix(scale, 0, 0, scale, -vPx - width / 2, -uPx - height / 2);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill({ texture, matrix, textureSpace: "global" });
    return;
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
        lerp(-width / 2 + inset, width / 2 - inset, (i + 0.5) / grainLines) +
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
      const cy = lerp(-height / 2 + ry + inset, height / 2 - ry - inset, rng());
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
        const cx = lerp(-width / 2 + rx + inset, width / 2 - rx - inset, rng());
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
        const cx = lerp(-width / 2 + rx + inset, width / 2 - rx - inset, rng());
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
}
