import React from "react";
import { CellInfo, useCellMap } from "../../game/CellMap";
import { GameState } from "../../game/GameState";
import { scaleVec, translateVec } from "../../game/Vectors";
import { combineActions } from "../../game/game-actions/misc-actions";
import {
  addWorkItemAction,
  applyWorkItemAction,
} from "../../game/game-actions/work-item-actions";
import { findPath } from "../../utils/pathingUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { CELL_SIZE, SPACING } from "./ShopView";
import { classNames } from "../../utils/classNames";

export const FloorTileSprite: React.FC<{ cell: CellInfo }> = ({ cell }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const cellMap = useCellMap();
  const size = CELL_SIZE - SPACING * 2;

  const [x, y] = translateVec(scaleVec(cell.position, CELL_SIZE), [
    SPACING,
    SPACING,
  ]);

  return (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      className={classNames("fill-zinc-700 hover:fill-zinc-600")}
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
        console.log("Clicked on cell", cell.position, path);
      }}
    />
  );
};

// Get the position at the end of the current work queue
function getWorkQueueEndState(gameState: GameState): GameState {
  for (const workItem of gameState.player.workQueue) {
    gameState = applyWorkItemAction(workItem)(gameState);
  }
  return gameState;
}
