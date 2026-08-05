import React from "react";
import { footprintCenter, Machine } from "../../game/Machine";
import { useNearestTexture } from "../../utils/useNearestTexture";
import { WorktableSprite } from "../machine-sprites/WorktableSprite";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { StageFit } from "./stageMath";

/**
 * The bench view's backdrop is the shop itself, leaned into — literally:
 * the live shop canvas stays underneath, zoomed onto the bench by
 * BenchZoomCameraLayer, so everything around the bench is whatever is
 * actually there (the wall behind it, the neighboring pile, the rest of
 * the floor), undimmed and unstyled — being zoomed in with the bench
 * chrome up is signal enough that these are workbench hands. All this
 * layer re-draws is the bench's own art — the very same asset the shop
 * draws (makeshift-bench.png nearest-sampled so the close-up stays
 * crisp, WorktableSprite vectors for built tables) — at the scene's
 * resolution, so the top under the hands is sharp, pixel-locked over
 * the shop's copy.
 */
export const BenchSceneBackdrop: React.FC<{
  machine: Machine;
  /** The scene frame's fit (frame inches over the whole stage). */
  fit: StageFit;
}> = ({ machine, fit }) => {
  const benchTexture = useNearestTexture("/images/makeshift-bench.png");

  const centerX = fit.originX + (fit.widthIn / 2) * fit.pxPerIn;
  const centerY = fit.originY + (fit.heightIn / 2) * fit.pxPerIn;

  const [footX, footY] = footprintCenter(machine.type.cellsOccupied);

  return machine.type.worktable ? (
    <pixiContainer
      x={centerX}
      y={centerY}
      scale={fit.pxPerIn / PIXELS_PER_INCH}
    >
      <pixiContainer x={-footX * PIXELS_PER_CELL} y={-footY * PIXELS_PER_CELL}>
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
  );
};
