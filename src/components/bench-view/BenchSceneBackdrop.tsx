import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { footprintCenter, Machine } from "../../game/Machine";
import { benchTopSizeIn } from "../../game/bench-work/bench-layout";
import { useNearestTexture } from "../../utils/useNearestTexture";
import { WorktableSprite } from "../machine-sprites/WorktableSprite";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { StageFit } from "./stageMath";

/**
 * The bench view's backdrop is the shop itself, leaned into — literally:
 * the live shop canvas stays underneath, zoomed onto the bench by
 * BenchZoomCameraLayer, so everything around the bench is whatever is
 * actually there (the wall behind it, the neighboring pile, the rest of
 * the floor). This layer deliberately paints no floor of its own — a
 * floor patch over the real view is exactly the seam that made the dive
 * read as a picture instead of a camera. What it adds is the close-up:
 * a dim over the periphery and a pool of light on the work, and the
 * bench's own art — the very same asset the shop draws
 * (makeshift-bench.png nearest-sampled so the close-up stays crisp,
 * WorktableSprite vectors for built tables) — re-drawn at the scene's
 * resolution so the top under the hands is sharp, pixel-locked over the
 * shop's copy.
 */
export const BenchSceneBackdrop: React.FC<{
  machine: Machine;
  /** The scene frame's fit (frame inches over the whole stage). */
  fit: StageFit;
  stageWidth: number;
  stageHeight: number;
}> = ({ machine, fit, stageWidth, stageHeight }) => {
  const benchTexture = useNearestTexture("/images/makeshift-bench.png");
  const bench = benchTopSizeIn(machine.type);

  const centerX = fit.originX + (fit.widthIn / 2) * fit.pxPerIn;
  const centerY = fit.originY + (fit.heightIn / 2) * fit.pxPerIn;

  // The rest of the shop recedes so the bench top carries the light
  const drawDim = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, stageWidth, stageHeight).fill({
        color: 0x000000,
        alpha: 0.3,
      });
    },
    [stageWidth, stageHeight],
  );

  // A soft pool of light over the work
  const drawLight = useCallback(
    (g: Graphics) => {
      g.clear();
      const benchWidthPx = bench.widthIn * fit.pxPerIn;
      const benchHeightPx = bench.heightIn * fit.pxPerIn;
      g.ellipse(
        centerX,
        centerY,
        benchWidthPx * 1.05,
        benchHeightPx * 1.15,
      ).fill({ color: 0xfff3d6, alpha: 0.1 });
    },
    [centerX, centerY, bench, fit.pxPerIn],
  );

  const [footX, footY] = footprintCenter(machine.type.cellsOccupied);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawDim} />
      {machine.type.worktable ? (
        <pixiContainer
          x={centerX}
          y={centerY}
          scale={fit.pxPerIn / PIXELS_PER_INCH}
        >
          <pixiContainer
            x={-footX * PIXELS_PER_CELL}
            y={-footY * PIXELS_PER_CELL}
          >
            <WorktableSprite machine={machine} />
          </pixiContainer>
        </pixiContainer>
      ) : (
        benchTexture && (
          <pixiSprite
            texture={benchTexture}
            anchor={{ x: 0.5, y: 0.5 }}
            x={centerX}
            y={centerY}
            // The art ships at 8 px per inch (the machine-art pipeline)
            scale={fit.pxPerIn / 8}
          />
        )
      )}
      <pixiGraphics draw={drawLight} />
    </pixiContainer>
  );
};
