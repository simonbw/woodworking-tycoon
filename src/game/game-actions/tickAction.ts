import { GameAction } from "../GameState";
import { applyWorkItemAction } from "./work-item-actions";

export const tickAction: GameAction = (gameState) => {
  gameState = {
    ...gameState,
    player: {
      ...gameState.player,
      canWork: true,
    },
  };

  // TODO: This might be kinda inefficient
  while (gameState.player.canWork && gameState.player.workQueue.length > 0) {
    const workQueue = [...gameState.player.workQueue];
    const workItem = workQueue.shift()!;

    gameState = applyWorkItemAction(workItem)(gameState);
    gameState = {
      ...gameState,
      player: {
        ...gameState.player,
        workQueue,
      },
    };
  }

  // TODO: Update all machines in progress?

  return {
    ...gameState,
    tick: gameState.tick + 1,
  };
};
