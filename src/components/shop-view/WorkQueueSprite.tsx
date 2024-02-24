import React from "react";
import {
  Vector,
  scaleVec,
  translateVec,
  vectorEquals,
} from "../../game/Vectors";
import { applyWorkItemAction } from "../../game/game-actions/work-item-actions";
import { useGameState } from "../useGameState";
import { CELL_SIZE, scaled } from "./ShopView";

export const WorkQueueSprite: React.FC = () => {
  const gameState = useGameState();

  let positions = [];
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

  if (positions.length === 0) {
    return null;
  }

  positions.unshift(gameState.player.position);

  function toScreen(position: Vector): Vector {
    return scaleVec(translateVec(position, [0.5, 0.5]), CELL_SIZE);
  }

  const d =
    `M${toScreen(positions[0]).join(",")} ` +
    positions
      .slice(1)
      .map(toScreen)
      .map((screenPosition) => `L ${screenPosition.join(",")}`)
      .join(" ");
  return (
    <g>
      <path
        d={d}
        fill="none"
        className="stroke-[8] stroke-sky-500/50"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};
