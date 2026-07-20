import { GameAction } from "../GameState";
import { WorkItem } from "../Person";
import { carryingShopVac } from "../ShopVac";
import { sweepAction } from "./dust-actions";
import { instaMovePlayerAction } from "./player-actions";
import { vacuumAction } from "./shop-vac-actions";

/** Applies a work item to the game state */
export function applyWorkItemAction(workItem: WorkItem): GameAction {
  return (gameState) => {
    switch (workItem.type) {
      case "move":
        return instaMovePlayerAction(workItem.direction)(gameState);
      case "sweep":
        // One clean-up key: the tool in hand decides what it does
        return carryingShopVac(gameState)
          ? vacuumAction()(gameState)
          : sweepAction()(gameState);
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
