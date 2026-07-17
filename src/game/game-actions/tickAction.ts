import { GameAction } from "../GameState";
import { SoundEvent } from "../SoundEvent";
import { applyWorkItemAction } from "./work-item-actions";
import { executeOperation } from "../operation-helpers";
import { isFinishedProduct } from "../material-helpers";
import { playerAttendsMachine } from "../machine-helpers";
import { Machine } from "../Machine";
import { getSellValue } from "../material-values";
import { getOperationPhases } from "../skill-helpers";
import { ToolId } from "../Tool";
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

  // Process machines that are operating. Attended phases only tick while
  // the player stands at the operation cell; hands-free phases (glue
  // curing) run regardless, even during away trips. Finished products earn
  // craft XP when their operation completes — making things is how you
  // learn.
  let xpEarned = 0;
  const soundEvents: SoundEvent[] = [];
  const toolsGranted: ToolId[] = [];
  const updatedMachines = gameState.machines.map((machineState) => {
    if (machineState.operationProgress.status !== "inProgress") {
      return machineState;
    }

    // Look the operation up through the Machine view so mounted tools'
    // operations resolve too.
    const machine = new Machine(machineState);
    const selectedOperation = machine.operations.find(
      (op) => op.id === machineState.selectedOperationId,
    );
    if (!selectedOperation) {
      throw new Error(
        `Unknown operation: ${machineState.selectedOperationId} for machine ${machineState.machineTypeId}`
      );
    }

    const phases = getOperationPhases(selectedOperation, gameState.progression);
    const attended = playerAttendsMachine(
      machine,
      gameState.player.position,
      gameState.player.away !== null,
    );
    const { phaseIndex, ticksRemaining } = machineState.operationProgress;

    // Waiting at a phase boundary: the previous phase is done but the next
    // one is attended and the player wasn't there. Enter it once they are.
    if (ticksRemaining === 0) {
      const nextPhase = phases[phaseIndex + 1];
      if (!nextPhase || (nextPhase.attended && !attended)) {
        return machineState;
      }
      return {
        ...machineState,
        operationProgress: {
          status: "inProgress" as const,
          phaseIndex: phaseIndex + 1,
          ticksRemaining: nextPhase.duration,
        },
      };
    }

    // Attended phases pause (never cancel) while the player is elsewhere
    const currentPhase = phases[Math.min(phaseIndex, phases.length - 1)];
    if (currentPhase.attended && !attended) {
      return machineState;
    }

    const newTicksRemaining = ticksRemaining - 1;

    // Phase still in progress
    if (newTicksRemaining > 0) {
      return {
        ...machineState,
        operationProgress: {
          ...machineState.operationProgress,
          ticksRemaining: newTicksRemaining,
        },
      };
    }

    // Phase finished with more to go: advance, or hold at the boundary if
    // the next phase needs the player and they've stepped away
    if (phaseIndex < phases.length - 1) {
      const nextPhase = phases[phaseIndex + 1];
      const canEnterNext = !nextPhase.attended || attended;
      return {
        ...machineState,
        operationProgress: canEnterNext
          ? {
              status: "inProgress" as const,
              phaseIndex: phaseIndex + 1,
              ticksRemaining: nextPhase.duration,
            }
          : {
              status: "inProgress" as const,
              phaseIndex,
              ticksRemaining: 0,
            },
      };
    }

    // Operation completed - apply the transformation
    const { inputs, outputs, toolOutputs } = executeOperation(
      selectedOperation,
      machineState.processingMaterials,
      machineState.selectedParameters
    );

    for (const output of outputs) {
      if (isFinishedProduct(output)) {
        xpEarned += Math.round(getSellValue(output));
      }
    }

    // Shop-made tooling (e.g. the crosscut sled) lands in tool storage
    if (toolOutputs) {
      toolsGranted.push(...toolOutputs);
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
        phaseIndex: 0,
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

  const withTools =
    toolsGranted.length > 0
      ? {
          ...nextState,
          storage: {
            ...nextState.storage,
            tools: [...nextState.storage.tools, ...toolsGranted],
          },
        }
      : nextState;

  return withXp(withTools, xpEarned);
};
