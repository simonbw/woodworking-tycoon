import { Assets, Graphics, Matrix, Texture } from "pixi.js";
import React, { useCallback } from "react";
import { SheetGood } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { lerp } from "../../utils/mathUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { seededRandom } from "../../utils/randUtils";
import { colorBySheetGoodKind } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { SHEET_FACE_TEXTURES } from "./sheetFaceTextures";

/**
 * A sheet good's face is real art: a seamless photo tile per kind
 * (sheetFaceTextures.ts), windowed by the piece's face region so a cut
 * piece shows the very stretch of veneer it had before the cut — the
 * fill matrix is the rendering half of the SheetFaceRegion contract
 * (see sheetFacePoint in sheet-helpers.ts, which the matrix mirrors).
 * Every kind has art now; the procedural speckle face below stays as
 * the fallback for any future kind that ships before its texture.
 *
 * The edge face is still drawn: plywood's laminations stripe it, the
 * chip boards crumble into speckle, MDF stays solid. Seeded, so a sheet
 * never shimmers between renders.
 */
export const SheetGoodSprite: React.FC<
  {
    sheet: Omit<SheetGood, "id" | "type">;
    /** Stable identity for seeded detail; pass the material id. A
     * virgin sheet's face window is seeded by it. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ sheet, seed, ...rest }) => {
  const {
    width: sheetWidth,
    length: sheetLength,
    thickness,
    kind,
    face,
  } = sheet;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      // Unlike boards, a sheet's width AND length are both in inches
      const width = sheetWidth * PIXELS_PER_INCH;
      const height = sheetLength * PIXELS_PER_INCH;
      const depth = (thickness * PIXELS_PER_INCH) / 4;
      const rng = seededRandom(
        seed ?? `${kind}-${sheetWidth}x${sheetLength}x${thickness}`,
      );
      const { primary, secondary } = colorBySheetGoodKind[kind];

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

      const faceArt = SHEET_FACE_TEXTURES[kind];
      if (faceArt) {
        // The piece's window onto its source sheet's face, in inches
        // (virgin default inlined — the sprite has no id to seed by
        // beyond the seed prop). The source sheet itself sits at a
        // seeded spot on the endless tiling art, so two sheets of one
        // kind don't share a veneer.
        const region = face ?? {
          seed: seed ?? `${kind}-${sheetWidth}x${sheetLength}x${thickness}`,
          u: 0,
          v: 0,
          rotated: false,
        };
        const texture = Assets.get<Texture>(faceArt.src);
        const baseRng = seededRandom(region.seed);
        const uPx =
          (region.u + baseRng() * faceArt.spanInches) * PIXELS_PER_INCH;
        const vPx =
          (region.v + baseRng() * faceArt.spanInches) * PIXELS_PER_INCH;
        // Local px per texture px; the matrix maps texture pixels into
        // this sprite's local space (PIXI inverts it to build UVs). The
        // rotated case transposes the axes: image y is the veneer's
        // grain (the source's u/length axis), image x runs across.
        const scale =
          (PIXELS_PER_INCH * faceArt.spanInches) / texture.source.width;
        const matrix = region.rotated
          ? new Matrix(0, scale, scale, 0, -uPx - width / 2, -vPx - height / 2)
          : new Matrix(scale, 0, 0, scale, -vPx - width / 2, -uPx - height / 2);
        g.rect(-width / 2, -height / 2, width, height);
        g.fill({ texture, matrix, textureSpace: "global" });
      } else {
        // Coarse chips pressed flat: a dense two-tone speckle
        g.rect(-width / 2, -height / 2, width, height);
        g.fill(primary);
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
    [sheetWidth, sheetLength, thickness, kind, face, seed],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
