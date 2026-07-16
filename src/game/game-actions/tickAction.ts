import { GameAction } from "../GameState";
import { SoundEvent } from "../SoundEvent";
import { applyWorkItemAction } from "./work-item-actions";
import { executeOperation } from "../operation-helpers";
import { isFinishedProduct } from "../material-helpers";
import { Machine } from "../Machine";
import { getSellValue } from "../material-values";
import { withXp } from "./skill-actions";

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

  // Process machines that are operating. Finished products earn craft XP
  // when their operation completes — making things is how you learn.
  let xpEarned = 0;
  const soundEvents: SoundEvent[] = [];
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

    for (const output of outputs) {
      if (isFinishedProduct(output)) {
        xpEarned += Math.round(getSellValue(output));
      }
    }

    // Cue a sound for the finished operation; GameSoundLayer picks the clip
    // from the operation (so tool operations sound like the tool).
    soundEvents.push({
      kind: "operation-complete",
      machineTypeId: machineState.machineTypeId,
      operationId: machineState.selectedOperationId,
    });

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
    soundEvents.push({ kind: "sale", machineTypeId: machineState.machineTypeId });
    return { ...machineState, inputMaterials: remaining };
  });

  // Only override pendingSounds when there's something to add, so quiet ticks
  // keep the queue's reference stable and don't re-trigger the sound drain.
  const nextState =
    soundEvents.length > 0
      ? {
          ...gameState,
          money,
          machines: machinesAfterSales,
          tick: gameState.tick + 1,
          pendingSounds: [...(gameState.pendingSounds ?? []), ...soundEvents],
        }
      : {
          ...gameState,
          money,
          machines: machinesAfterSales,
          tick: gameState.tick + 1,
        };

  return withXp(nextState, xpEarned);
};
