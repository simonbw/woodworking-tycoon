import React from "react";
import { footprintCenter, Machine } from "../../game/Machine";
import { useTexture } from "../../utils/useTexture";
import { WorktableSprite } from "../machine-sprites/WorktableSprite";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { StageFit } from "./stageMath";

/**
 * The bench's close-up export: the same drawing as the shop's copy, but at
 * 32 px per inch instead of the pipeline's 8, because leaning over the
 * bench puts it on screen at roughly its native size instead of an eighth
 * of it. Both exports are anchored on their canvas center and trimmed
 * symmetrically about it, so swapping one for the other lands the art in
 * exactly the same place.
 */
const ZOOMED_BENCH_PX_PER_IN = 32;

/**
 * The bench view's backdrop is the shop itself, leaned into — literally:
 * the live shop canvas stays underneath, zoomed onto the bench by
 * BenchZoomCameraLayer, so everything around the bench is whatever is
 * actually there (the wall behind it, the neighboring pile, the rest of
 * the floor), undimmed and unstyled — being zoomed in with the bench
 * chrome up is signal enough that these are workbench hands. All this
 * layer re-draws is the bench itself — the close-up export of the same
 * drawing the shop shows (makeshift-bench-zoomed.png; WorktableSprite
 * vectors for built tables) — pixel-locked over the shop's copy, so the
 * top under the hands is sharp. Until that export decodes there is
 * nothing to fall back to and nothing to hide: the shop's own copy is
 * right underneath, already zoomed and in register.
 */
export const BenchSceneBackdrop: React.FC<{
  machine: Machine;
  /** The scene frame's fit (frame inches over the whole stage). */
  fit: StageFit;
}> = ({ machine, fit }) => {
  const benchTexture = useTexture("/images/makeshift-bench-zoomed.png");

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
        scale={fit.pxPerIn / ZOOMED_BENCH_PX_PER_IN}
      />
    )
  );
};
