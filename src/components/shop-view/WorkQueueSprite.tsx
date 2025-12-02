import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { GameState } from "../../game/GameState";
import { Vector, vectorEquals } from "../../game/Vectors";
import { applyWorkItemAction } from "../../game/game-actions/work-item-actions";
import { useGameState } from "../useGameState";
import { cellToPixelCenter } from "./shop-scale";

export const WorkQueueSprite: React.FC = () => {
  const gameState = useGameState();

  let hypotheticalState = gameState;
  const positions: Vector[] = [];
  let lastPosition = gameState.player.position;
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
    (g: Graphics) => {
      g.clear();
      const [startX, startY] = cellToPixelCenter(positions[0]);
      g.moveTo(startX, startY);
      for (const position of positions.slice(1)) {
        const [x, y] = cellToPixelCenter(position);
        g.lineTo(x, y);
      }
      g.stroke({ width: 8, color: 0x87ceeb, alpha: 0.5 });
    },
    [positions]
  );

  if (positions.length === 1) {
    return null;
  }

  return <pixiGraphics draw={draw} />;
};
