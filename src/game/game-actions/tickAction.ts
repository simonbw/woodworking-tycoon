import { GameAction } from "../GameState";
import { applyWorkItemAction } from "./work-item-actions";
import { executeOperation } from "../operation-helpers";
import { MACHINE_TYPES } from "../Machine";

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
  const updatedMachines = gameState.machines.map((machineState) => {
    if (machineState.operationProgress.status !== "inProgress") {
      return machineState;
    }

    const newTicksRemaining = machineState.operationProgress.ticksRemaining - 1;

    // Operation still in progress
    if (newTicksRemaining > 0) {
      return {
        ...machineState,
        operationProgress: {
          ...machineState.operationProgress,
          ticksRemaining: newTicksRemaining,
        },
      };
    }

    // Operation completed - apply the transformation
    const machineType = MACHINE_TYPES[machineState.machineTypeId];
    const selectedOperation = machineType.operations.find(
      (op) => op.id === machineState.selectedOperationId
    );
    if (!selectedOperation) {
      throw new Error(
        `Unknown operation: ${machineState.selectedOperationId} for machine ${machineState.machineTypeId}`
      );
    }

    const { inputs, outputs } = executeOperation(
      selectedOperation,
      machineState.processingMaterials,
      machineState.selectedParameters
    );

    return {
      ...machineState,
      inputMaterials: [...machineState.inputMaterials, ...inputs],
      processingMaterials: [],
      outputMaterials: [...machineState.outputMaterials, ...outputs],
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
