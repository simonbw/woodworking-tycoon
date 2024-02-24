import { GameAction } from "../GameState";
import { WorkItem } from "../Person";
import { instaMovePlayerAction } from "./player-actions";

/** Applies a work item to the game state */
export function applyWorkItemAction(workItem: WorkItem): GameAction {
  return (gameState) => {
    switch (workItem.type) {
      case "move":
        return instaMovePlayerAction(workItem.direction)(gameState);
      default:
        throw new Error("Invalid work item type");
    }
  };
}

/** Adds a work item to the player's work queue */
export function addWorkItemAction(workItem: WorkItem): GameAction {
  return (gameState) => {
    if (gameState.player.canWork) {
      return applyWorkItemAction(workItem)(gameState);
    } else {
      return {
        ...gameState,
        player: {
          ...gameState.player,
          workQueue: [...gameState.player.workQueue, workItem],
        },
      };
    }
  };
}

/** Cancels the last work item in the player's work queue */
export function cancelLastWorkItemAction(): GameAction {
  return (gameState) => {
    const workQueue = [...gameState.player.workQueue];
    workQueue.pop();
    return {
      ...gameState,
      player: {
        ...gameState.player,
        workQueue,
      },
    };
  };
}

/** Removes all items from the player's work queue */
export function clearWorkQueueAction(): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      player: {
        ...gameState.player,
        workQueue: [],
      },
    };
  };
}
