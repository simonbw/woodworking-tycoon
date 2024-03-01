import React from "react";
import { useGameActions } from "../useGameActions";
import { useKeyDown } from "../useKeyDown";
import { useApplyGameAction } from "../useGameState";
import { instaMovePlayerAction } from "../../game/game-actions/player-actions";
import { clearWorkQueueAction } from "../../game/game-actions/work-item-actions";
import { combineActions } from "../../game/game-actions/misc-actions";

export const ShopKeyboardShortcuts: React.FC = () => {
  const applyAction = useApplyGameAction();

  useKeyDown((event) => {
    switch (event.code) {
      case "Escape":
        return applyAction(clearWorkQueueAction());
      case "KeyD":
      case "ArrowRight":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(0))
        );
      case "KeyW":
      case "ArrowUp":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(1))
        );
      case "KeyA":
      case "ArrowLeft":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(2))
        );
      case "KeyS":
      case "ArrowDown":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(3))
        );
    }
  });
  return null;
};
