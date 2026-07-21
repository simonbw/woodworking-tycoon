import { addConsumables, ConsumableAmount } from "../Consumable";
import { emitMachineDust, machineDustMultiplier } from "../Dust";
import { DUST_BAG_CAPTURE } from "../tools/dustBag";
import { GameAction } from "../GameState";
import { Species } from "../Materials";
import { SoundEvent } from "../SoundEvent";
import { marketplaceTickPass } from "./marketplace-actions";
import { checkProgressionMilestonesAction } from "./progression-actions";
import { shopVacTickPass } from "./shop-vac-actions";
import { applyWorkItemAction } from "./work-item-actions";
import { executeOperation } from "../operation-helpers";
import { isFinishedProduct, materialSpecies } from "../material-helpers";
import { playerAttendsMachine } from "../machine-helpers";
import { Machine, MachineId } from "../Machine";
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

  // Still trudging through dust (or mid-sweep): this tick goes to that,
  // not to the work queue. Attendance is positional, so a machine the
  // player is standing at keeps running.
  const busyTicks = gameState.player.busyTicks ?? 0;
  if (busyTicks > 0 && gameState.player.canWork) {
    gameState = {
      ...gameState,
      player: {
        ...gameState.player,
        canWork: false,
        busyTicks: busyTicks - 1,
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

  // The dragged shop vac trickle-cleans underfoot and self-empties at
  // the garbage can
  gameState = shopVacTickPass()(gameState);

  // Process machines that are operating. Attended phases only tick while
  // the player stands at the operation cell; hands-free phases (glue
  // curing) run regardless, even during away trips. Finished products earn
  // craft XP when their operation completes — making things is how you
  // learn.
  let xpEarned = 0;
  const soundEvents: SoundEvent[] = [];
  const toolsGranted: ToolId[] = [];
  const machinesGranted: MachineId[] = [];
  const consumablesGranted: ConsumableAmount[] = [];
  const dustEmissions: Array<{
    machine: Machine;
    species: ReadonlyArray<Species>;
    amount: number;
  }> = [];
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
        `Unknown operation: ${machineState.selectedOperationId} for machine ${machineState.machineTypeId}`,
      );
    }

    const dustMultiplier = machineDustMultiplier(
      gameState.dust,
      machine,
      gameState.shopInfo.size,
    );
    const phases = getOperationPhases(
      selectedOperation,
      gameState.progression,
      dustMultiplier,
      machine.type.workSpeed,
    );
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

    // The cut is happening this tick, so the sawdust flies now too —
    // hands-free phases (glue curing) make no mess. Scaled down by the
    // slowdown so a dust-choked operation sheds the same total dust over
    // its longer run, instead of compounding into a runaway. A mounted
    // dust bag catches most of it at the port.
    const dustOutput = selectedOperation.dustOutput ?? 0;
    if (dustOutput > 0 && currentPhase.attended) {
      const species = [
        ...new Set(machineState.processingMaterials.flatMap(materialSpecies)),
      ];
      const bagFactor = machineState.tools.includes("dustBag")
        ? 1 - DUST_BAG_CAPTURE
        : 1;
      if (species.length > 0) {
        dustEmissions.push({
          machine,
          species,
          amount: (dustOutput * bagFactor) / dustMultiplier,
        });
      }
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
    const { inputs, outputs, toolOutputs, consumableOutputs, machineOutputs } =
      executeOperation(
        selectedOperation,
        machineState.processingMaterials,
        machineState.selectedParameters,
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

    // Shop-built furniture (worktables) lands in machine storage, to be
    // placed from the layout editor
    if (machineOutputs) {
      machinesGranted.push(...machineOutputs);
    }

    // Salvaged supplies (e.g. pallet nails) go to the shop-wide stock
    if (consumableOutputs) {
      consumablesGranted.push(...consumableOutputs);
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

  // Reference stays stable on dustless ticks so caches keyed on it hold
  let dust = gameState.dust;
  for (const emission of dustEmissions) {
    dust = emitMachineDust(
      dust,
      emission.machine,
      emission.species,
      emission.amount,
      gameState.shopInfo.size,
    );
  }

  // Only override pendingSounds when there's something to add, so quiet ticks
  // keep the queue's reference stable and don't re-trigger the sound drain.
  const nextState =
    soundEvents.length > 0
      ? {
          ...gameState,
          machines: updatedMachines,
          tick: gameState.tick + 1,
          dust,
          pendingSounds: [...(gameState.pendingSounds ?? []), ...soundEvents],
        }
      : {
          ...gameState,
          machines: updatedMachines,
          tick: gameState.tick + 1,
          dust,
        };

  const withTools =
    toolsGranted.length > 0 || machinesGranted.length > 0
      ? {
          ...nextState,
          storage: {
            ...nextState.storage,
            tools: [...nextState.storage.tools, ...toolsGranted],
            machines: [...nextState.storage.machines, ...machinesGranted],
          },
        }
      : nextState;

  const withConsumables =
    consumablesGranted.length > 0
      ? {
          ...withTools,
          consumables: addConsumables(
            withTools.consumables,
            consumablesGranted,
          ),
        }
      : withTools;

  // Marketplace: listings roll their sale chance, demand recovers, and the
  // job board refreshes at day boundaries. Milestones run last so unlocks
  // that hinge on tick-driven state (a dusty floor) fire on their own.
  return checkProgressionMilestonesAction()(
    withXp(marketplaceTickPass()(withConsumables), xpEarned),
  );
};
