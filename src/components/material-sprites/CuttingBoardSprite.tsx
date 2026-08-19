import { FillInput, Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  defaultBoardFace,
  FinishedProduct,
  Species,
} from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { endFill, faceFill, TURNED_AWAY_SHADE, woodArt } from "./woodFills";

/** Accent stripes for each board tier, as [offset, width] in inches. */
function accentStripes(type: FinishedProduct["type"]): [number, number][] {
  switch (type) {
    case "stripedCuttingBoard":
      // Strict alternation: accent at 2-4" and 6-8" of a 10" board
      return [
        [2, 2],
        [6, 2],
      ];
    case "sunriseCuttingBoard":
      // The fade: accent strips growing 1", 2", 3" across a 12" board
      return [
        [3, 1],
        [6, 2],
        [9, 3],
      ];
    default:
      // Two-tone: a free mix, so one wide stripe and one narrow
      return [
        [1.5, 3],
        [7, 1],
      ];
  }
}

/**
 * A finished cutting board: rounded corners and a hanging hole, its
 * woods drawn from the same scans the stock was cut from. The
 * long-grain tiers window face grain running the board's length; the
 * end-grain tier is a brick of sawn ends, which is the whole point of
 * building one.
 *
 * Everything above the base layer is laid in rows trimmed to the
 * rounded outline, so a stripe or a block near a corner comes back to
 * the curve instead of squaring it off. Any sliver a row gives up shows
 * the base wood underneath, which is what would be there anyway.
 */
export const CuttingBoardSprite: React.FC<
  {
    material: FinishedProduct;
    /** Stable identity for the grain; pass the material id. */
    seed?: string;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ material, seed, ...rest }) => {
  const { type, species, accentSpecies } = material;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const widthInches = type === "sunriseCuttingBoard" ? 12 : 10;
      const lengthInches = 16;
      const width = widthInches * PIXELS_PER_INCH;
      const height = lengthInches * PIXELS_PER_INCH;
      const radius = 2 * PIXELS_PER_INCH;
      const boardSeed = seed ?? `${type}-${species}`;
      const isEndGrain = type === "endGrainCuttingBoard";

      // shadow
      for (const shadowWidth of [1, 2]) {
        g.roundRect(
          -width / 2 - shadowWidth,
          -height / 2 - shadowWidth,
          width + shadowWidth * 2,
          height + shadowWidth * 2,
          radius + shadowWidth,
        );
        g.fill({ color: 0x000000, alpha: 0.1 });
      }

      // One window per wood, so the two species keep their own grain
      const woodFor = (which: Species, tag: string) => {
        const region = defaultBoardFace(
          `${boardSeed}/${tag}`,
          lengthInches,
          widthInches,
        );
        return { art: woodArt(which, region.seed, 4), region };
      };
      const base = woodFor(species, "base");
      const accent =
        accentSpecies !== undefined
          ? woodFor(accentSpecies, "accent")
          : undefined;

      /** How far the rounded outline reaches at a given height. */
      const halfWidthAt = (y: number) => {
        const past = Math.abs(y) - (height / 2 - radius);
        return past <= 0
          ? width / 2
          : width / 2 -
              radius +
              Math.sqrt(Math.max(0, radius * radius - past * past));
      };

      /** A rect laid in rows, each trimmed back to the outline. */
      const fillTrimmed = (
        left: number,
        top: number,
        right: number,
        bottom: number,
        fill: FillInput,
      ) => {
        for (let y = top; y < bottom; y += 1) {
          const rowBottom = Math.min(y + 1, bottom);
          // The narrower of the row's two edges, so it never overhangs
          const limit = Math.min(halfWidthAt(y), halfWidthAt(rowBottom));
          const x0 = Math.max(left, -limit);
          const x1 = Math.min(right, limit);
          if (x1 <= x0) {
            continue;
          }
          g.rect(x0, y, x1 - x0, rowBottom - y);
          g.fill(fill);
        }
      };

      // The board itself, in the base wood — the backdrop every row
      // above sits on, and the only thing drawn as the true outline
      g.roundRect(-width / 2, -height / 2, width, height, radius);
      g.fill(
        isEndGrain
          ? endFill(
              base.art,
              `${boardSeed}/field`,
              widthInches,
              lengthInches,
              -width / 2,
              -height / 2,
            )
          : faceFill(base.art, base.region, -width / 2, -height / 2),
      );

      const block = 2 * PIXELS_PER_INCH;
      if (isEndGrain) {
        // Blocks stood on end and glued in a straight grid — smaller
        // than the checkerboard's squares, the way the sticks get
        // crosscut before they're turned up
        const endBlock = 1.5 * PIXELS_PER_INCH;
        let row = 0;
        for (let y = -height / 2; y < height / 2; y += endBlock) {
          const bottom = Math.min(y + endBlock, height / 2);
          let col = 0;
          for (let x = -width / 2; x < width / 2; x += endBlock) {
            const right = Math.min(x + endBlock, width / 2);
            // Alternate the woods so a two-species board checkers
            const wood =
              accent !== undefined && (row + col) % 2 === 1 ? accent : base;
            fillTrimmed(
              x,
              y,
              right,
              bottom,
              endFill(
                wood.art,
                `${boardSeed}/block-${row}-${col}`,
                (right - x) / PIXELS_PER_INCH,
                (bottom - y) / PIXELS_PER_INCH,
                x,
                y,
              ),
            );
            // the glue line down this block's right side
            fillTrimmed(right - 0.5, y, right, bottom, {
              color: 0x000000,
              alpha: 0.22,
            });
            col++;
          }
          // the glue line under the whole row
          fillTrimmed(-width / 2, bottom - 0.5, width / 2, bottom, {
            color: 0x000000,
            alpha: 0.22,
          });
          row++;
        }
        // End grain sits darker than a long-grain face would
        g.roundRect(-width / 2, -height / 2, width, height, radius);
        g.fill(TURNED_AWAY_SHADE);
      } else if (type === "checkerboardCuttingBoard" && accent !== undefined) {
        // A true two-tone grid, every other block the accent wood
        for (let row = 0; -height / 2 + row * block < height / 2; row++) {
          for (let col = 0; -width / 2 + col * block < width / 2; col++) {
            if ((row + col) % 2 === 0) {
              continue;
            }
            const x = -width / 2 + col * block;
            const y = -height / 2 + row * block;
            fillTrimmed(
              x,
              y,
              Math.min(x + block, width / 2),
              Math.min(y + block, height / 2),
              faceFill(accent.art, accent.region, -width / 2, -height / 2),
            );
          }
        }
      } else if (accent !== undefined) {
        // Accent stripes over the base wood, patterned by tier
        for (const [offset, stripeWidth] of accentStripes(type)) {
          fillTrimmed(
            -width / 2 + offset * PIXELS_PER_INCH,
            -height / 2,
            -width / 2 + (offset + stripeWidth) * PIXELS_PER_INCH,
            height / 2,
            faceFill(accent.art, accent.region, -width / 2, -height / 2),
          );
        }
      }

      // hanging hole, bored through to the shadow below
      g.circle(0, -height / 2 + 2 * PIXELS_PER_INCH, 0.75 * PIXELS_PER_INCH);
      g.fill({ color: 0x000000, alpha: 0.55 });
    },
    [type, species, accentSpecies, seed],
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
