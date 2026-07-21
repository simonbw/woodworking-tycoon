import { Graphics } from "pixi.js";
import React, { useCallback, useState } from "react";
import { animated, useSpring } from "react-spring";
import { MaterialInstance } from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";
import { MaterialSprite } from "../material-sprites/MaterialSprite";

const AnimatedPixiContainer = animated("pixiContainer");

/** Covers everything a feeding board could sweep past the cut line. */
const MASK_EXTENT = 4096;

function drawHalfPlane(g: Graphics, side: number): void {
  g.clear();
  g.rect(
    -MASK_EXTENT / 2,
    side > 0 ? 0 : -MASK_EXTENT,
    MASK_EXTENT,
    MASK_EXTENT,
  );
  g.fill(0xffffff);
}

/**
 * A board mid-operation, feeding through a machine: its position runs from
 * the infeed spot to the outfeed spot as the operation's progress goes
 * 0 → 1. Progress advances in whole ticks; the spring smooths the steps
 * into continuous motion, and holds still while the operation is paused
 * (progress frozen) waiting for the player.
 *
 * With `exitedAs`, the board is split at the cut line (machine-local y = 0):
 * the portion still on the infeed side draws as `board`, the portion that has
 * passed the cutter draws as `exitedAs` — so a freshly milled surface emerges
 * from the outfeed instead of popping in when the operation completes.
 */
export const FeedingBoard: React.FC<{
  board: MaterialInstance;
  /**
   * How the board looks once it's been through the cutter (usually the
   * operation's output). Same material id so procedural detail lines up.
   */
  exitedAs?: MaterialInstance;
  fraction: number;
  fromY: number;
  toY: number;
  x?: number;
  angle?: number;
  /** Override how the board is drawn (e.g. on edge against a fence). */
  children?: React.ReactNode;
}> = ({
  board,
  exitedAs,
  fraction,
  fromY,
  toY,
  x = 0,
  angle = 0,
  children,
}) => {
  const springProps = useSpring({ y: lerp(fromY, toY, fraction) });
  const [infeedMask, setInfeedMask] = useState<Graphics | null>(null);
  const [outfeedMask, setOutfeedMask] = useState<Graphics | null>(null);

  // Which side of the cut line the outfeed is on
  const outfeedSign = Math.sign(toY - fromY) || -1;
  const drawInfeedMask = useCallback(
    (g: Graphics) => drawHalfPlane(g, -outfeedSign),
    [outfeedSign],
  );
  const drawOutfeedMask = useCallback(
    (g: Graphics) => drawHalfPlane(g, outfeedSign),
    [outfeedSign],
  );

  const sprite = children ?? <MaterialSprite material={board} />;

  if (!exitedAs) {
    return (
      <AnimatedPixiContainer x={x} y={springProps.y} angle={angle}>
        {sprite}
      </AnimatedPixiContainer>
    );
  }

  return (
    <pixiContainer x={x}>
      <AnimatedPixiContainer y={springProps.y} angle={angle}>
        {infeedMask && (
          <pixiContainer mask={infeedMask}>{sprite}</pixiContainer>
        )}
        {outfeedMask && (
          <pixiContainer mask={outfeedMask}>
            <MaterialSprite material={exitedAs} />
          </pixiContainer>
        )}
      </AnimatedPixiContainer>
      {/* The masks live in machine space: the cut line stays put while the
          board moves under it. Pixi excludes mask graphics from rendering
          (includeInBuild = false), so these never draw. */}
      <pixiGraphics ref={setInfeedMask} draw={drawInfeedMask} />
      <pixiGraphics ref={setOutfeedMask} draw={drawOutfeedMask} />
    </pixiContainer>
  );
};
