import React from "react";
import { animated, useSpring } from "react-spring";
import { MaterialInstance } from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";
import { MaterialSprite } from "../material-sprites/MaterialSprite";

const AnimatedPixiContainer = animated("pixiContainer");

/**
 * A board mid-operation, feeding through a machine: its position runs from
 * the infeed spot to the outfeed spot as the operation's progress goes
 * 0 → 1. Progress advances in whole ticks; the spring smooths the steps
 * into continuous motion, and holds still while the operation is paused
 * (progress frozen) waiting for the player.
 */
export const FeedingBoard: React.FC<{
  board: MaterialInstance;
  fraction: number;
  fromY: number;
  toY: number;
  x?: number;
  angle?: number;
}> = ({ board, fraction, fromY, toY, x = 0, angle = 0 }) => {
  const springProps = useSpring({ y: lerp(fromY, toY, fraction) });

  return (
    <AnimatedPixiContainer x={x} y={springProps.y} angle={angle}>
      <MaterialSprite material={board} />
    </AnimatedPixiContainer>
  );
};
