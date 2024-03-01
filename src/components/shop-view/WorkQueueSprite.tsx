import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";
import { Vector, vectorEquals } from "../../game/Vectors";
import { applyWorkItemAction } from "../../game/game-actions/work-item-actions";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { useGameState } from "../useGameState";
import { cellCenter } from "./ShopView";

export const WorkQueueSprite: React.FC = () => {
  const gameState = useGameState();

  // TODO: Memoize this
  const positions: Vector[] = [];
  let lastPosition = gameState.player.position;
  let hypotheticalState = gameState;
  for (const workItem of gameState.player.workQueue) {
    hypotheticalState = applyWorkItemAction(workItem)(hypotheticalState);
    const newPosition = hypotheticalState.player.position;
    if (!vectorEquals(newPosition, lastPosition)) {
      positions.push(hypotheticalState.player.position);
      lastPosition = newPosition;
    }
  }
  positions.unshift(gameState.player.position);

  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.lineStyle(8, 0x87ceeb, 0.5);
      const [startX, startY] = cellCenter(positions[0]);
      g.moveTo(startX, startY);
      for (const position of positions.slice(1)) {
        const [x, y] = cellCenter(position);
        g.lineTo(x, y);
      }
    },
    [positions]
  );

  if (positions.length === 1) {
    return null;
  }

  return <Graphics draw={draw} />;
};
