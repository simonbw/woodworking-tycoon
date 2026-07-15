import { GameAction } from "../GameState";
import { applyWorkItemAction } from "./work-item-actions";
import { executeOperation } from "../operation-helpers";
import { Machine } from "../Machine";
import { getSellValue } from "../material-values";

export const tickAction: GameAction = (gameState) => {
  const away = gameState.player.away;
  if (away) {
    if (gameState.tick >= away.returnTick) {
      // Welcome home: drop the haul at the material dropoff spot
      gameState = {
        ...gameState,
        materialPiles: [
          ...gameState.materialPiles,
          ...away.loot.map((material) => ({
            material,
            position: gameState.shopInfo.materialDropoffPosition,
          })),
        ],
        player: { ...gameState.player, away: null, canWork: true },
      };
    } else {
      // Still out of the shop: no player work, but machines keep running
      gameState = {
        ...gameState,
        player: { ...gameState.player, canWork: false },
      };
    }
  } else {
    gameState = {
      ...gameState,
      player: {
        ...gameState.player,
        canWork: true,
      },
    };
  }

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

    // Operation completed - apply the transformation. Look the operation up
    // through the Machine view so mounted tools' operations resolve too.
    const selectedOperation = new Machine(machineState).operations.find(
      (op) => op.id === machineState.selectedOperationId,
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

  // Sales tables automatically sell one item per tick
  let money = gameState.money;
  const machinesAfterSales = updatedMachines.map((machineState) => {
    if (
      machineState.machineTypeId !== "salesTable" ||
      machineState.inputMaterials.length === 0
    ) {
      return machineState;
    }
    const [sold, ...remaining] = machineState.inputMaterials;
    // Round to cents so repeated sales don't accumulate float error
    money = Math.round((money + getSellValue(sold)) * 100) / 100;
    return { ...machineState, inputMaterials: remaining };
  });

  return {
    ...gameState,
    money,
    machines: machinesAfterSales,
    tick: gameState.tick + 1,
  };
};
