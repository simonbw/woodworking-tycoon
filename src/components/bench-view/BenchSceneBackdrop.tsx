import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { footprintCenter, Machine } from "../../game/Machine";
import { benchTopSizeIn } from "../../game/bench-work/bench-layout";
import { useNearestTexture } from "../../utils/useNearestTexture";
import { useTexture } from "../../utils/useTexture";
import { WorktableSprite } from "../machine-sprites/WorktableSprite";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { StageFit } from "./stageMath";

/**
 * The bench view's backdrop is the shop itself, leaned into: the same
 * concrete floor the shop view tiles, and the very same bench art —
 * makeshift-bench.png for the starting bench (nearest-sampled so the
 * close-up stays crisp pixel art), the WorktableSprite vectors for built
 * tables — just rendered at bench-view zoom. The zoomed bench and the
 * one on the shop floor can't drift apart, because they're one asset.
 */
export const BenchSceneBackdrop: React.FC<{
  machine: Machine;
  /** The scene frame's fit (frame inches over the whole stage). */
  fit: StageFit;
  stageWidth: number;
  stageHeight: number;
}> = ({ machine, fit, stageWidth, stageHeight }) => {
  // The shop view tiles this floor at 0.25 of its 4 px/in scale, so the
  // texture's native density is 16 px per shop inch.
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");
  const benchTexture = useNearestTexture("/images/makeshift-bench.png");
  const bench = benchTopSizeIn(machine.type);
  const floorScale = fit.pxPerIn / 16;

  const centerX = fit.originX + (fit.widthIn / 2) * fit.pxPerIn;
  const centerY = fit.originY + (fit.heightIn / 2) * fit.pxPerIn;

  // The floor recedes a touch so the bench top carries the light
  const drawFloorShade = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, stageWidth, stageHeight).fill({
        color: 0x000000,
        alpha: 0.18,
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
      ).fill({ color: 0xfff3d6, alpha: 0.07 });
    },
    [centerX, centerY, bench, fit.pxPerIn],
  );

  const [footX, footY] = footprintCenter(machine.type.cellsOccupied);

  return (
    <pixiContainer>
      <pixiTilingSprite
        texture={floorTexture}
        width={stageWidth}
        height={stageHeight}
        tileScale={{ x: floorScale, y: floorScale }}
        tilePosition={{ x: centerX, y: centerY }}
      />
      <pixiGraphics draw={drawFloorShade} />
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
