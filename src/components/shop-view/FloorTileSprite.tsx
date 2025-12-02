import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { CellInfo, useCellMap } from "../../game/CellMap";
import { GameState } from "../../game/GameState";
import { GameStateView } from "../../game/GameStateView";
import { combineActions } from "../../game/game-actions/misc-actions";
import {
  addWorkItemAction,
  applyWorkItemAction,
} from "../../game/game-actions/work-item-actions";
import { colors } from "../../utils/colors";
import { findPath } from "../../utils/pathingUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { PIXELS_PER_CELL, SPACING } from "./shop-scale";

export const FloorTileSprite: React.FC<{ cell: CellInfo }> = ({ cell }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const cellMap = useCellMap();

  const size = PIXELS_PER_CELL - SPACING * 2;
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.rect(SPACING, SPACING, size, size);
    g.fill(colors.zinc[700]);
  }, []);

  // TODO: Manage hover state
  return (
    <pixiGraphics
      eventMode="static"
      x={cell.position[0] * PIXELS_PER_CELL}
      y={cell.position[1] * PIXELS_PER_CELL}
      draw={draw}
      alpha={0.1}
      onClick={() => {
        const startPosition = getWorkQueueEndState(gameState).player.position;

        const path = findPath(
          startPosition,
          cell.position,
          cellMap.getFreeCells().map((cell) => cell.position)
        );

        if (path != undefined) {
          applyAction(
            combineActions(
              ...path.map((pathItem) =>
                addWorkItemAction({
                  type: "move",
                  direction: pathItem.direction,
                })
              )
            )
          );
        }
      }}
    />
  );
};

// Get the position at the end of the current work queue
function getWorkQueueEndState(gameStateView: GameStateView): GameState {
  // Convert view back to raw state
  let gameState: GameState = {
    ...gameStateView,
    machines: gameStateView.machines.map((m) => m.toState()),
  };
  for (const workItem of gameState.player.workQueue) {
    gameState = applyWorkItemAction(workItem)(gameState);
  }
  return gameState;
}
