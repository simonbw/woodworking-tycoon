import { GameAction } from "../GameState";
import { applyWorkItemAction } from "./work-item-actions";
import { executeOperation } from "../operation-helpers";

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

  // Process machines that are operating
  const updatedMachines = gameState.machines.map((machine) => {
    if (machine.operationProgress.status !== "inProgress") {
      return machine;
    }

    const newTicksRemaining = machine.operationProgress.ticksRemaining - 1;

    // Operation still in progress
    if (newTicksRemaining > 0) {
      return {
        ...machine,
        operationProgress: {
          ...machine.operationProgress,
          ticksRemaining: newTicksRemaining,
        },
      };
    }

    // Operation completed - apply the transformation
    const { inputs, outputs } = executeOperation(
      machine.selectedOperation,
      machine.processingMaterials,
      machine.selectedParameters
    );

    return {
      ...machine,
      inputMaterials: [...machine.inputMaterials, ...inputs],
      processingMaterials: [],
      outputMaterials: [...machine.outputMaterials, ...outputs],
      operationProgress: {
        status: "notStarted" as const,
        ticksRemaining: 0,
      },
    };
  });

  return {
    ...gameState,
    machines: updatedMachines,
    tick: gameState.tick + 1,
  };
};
