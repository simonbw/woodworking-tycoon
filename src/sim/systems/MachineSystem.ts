import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { stationWorkSpeed } from "../../game/bench-mounting";
import { deriveMachineCutLoad } from "../../game/cut-load";
import { emitMachineDust, machineDustMultiplier } from "../../game/Dust";
import {
  completeOperation,
  OperationCompletion,
} from "../../game/game-actions/operation-actions";
import { GameState } from "../../game/GameState";
import { Machine } from "../../game/Machine";
import { operationAttendanceSatisfied } from "../../game/machine-helpers";
import { materialDustSpecies } from "../../game/material-helpers";
import { DustSpecies } from "../../game/Materials";
import { getOperationPhases } from "../../game/skill-helpers";
import { DUST_BAG_CAPTURE } from "../../game/tools/dustBag";
import { MachineEntity } from "../entities/MachineEntity";
import { projectGameState } from "../projection";
import { DustLayer } from "../singletons/DustLayer";
import { TimeFlow } from "../TimeFlow";
import { applyCompletionGrants } from "./grants";

/**
 * The machines' slice of the sim tick. One pass per sim minute over
 * every machine entity: every
 * in-progress operation advances (or waits for the player), sheds dust,
 * and on completion delivers outputs and grants through the shared
 * completion commit. Attended phases only tick while the player stands
 * at the operation cell with the operate key held; hands-free phases
 * (glue curing) run regardless, even during away trips.
 *
 * The system also carries the machines' half of the time model: an
 * attended, satisfied, in-progress operation is what makes machine work
 * spend the player's time (the old `machineSpendsTime`), registered with
 * TimeFlow as a spender.
 *
 * Transient — never serialized; added per session by the bootstrap.
 */
export class MachineSystem extends BaseEntity implements Entity {
  id = "machineSystem";
  tickLayer: TickLayerName = "machines";
  persistenceLevel: number = Persistence.Permanent;

  private unregisterSpender: (() => void) | null = null;

  @on("afterAdded")
  onAfterAdded() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    if (timeFlow) {
      this.unregisterSpender = timeFlow.registerSpender(() =>
        this.anyMachineSpendsTime(),
      );
    }
  }

  @on("destroy")
  onDestroy() {
    this.unregisterSpender?.();
    this.unregisterSpender = null;
  }

  @on("tick")
  onTick() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    const minutes = timeFlow?.wholeTicks ?? 0;
    for (let i = 0; i < minutes; i++) {
      this.minutePass();
    }
  }

  /**
   * Whether any machine is actively consuming the player's time this
   * tick — the old `machineSpendsTime`, over every machine.
   */
  anyMachineSpendsTime(): boolean {
    const gameState = projectGameState(this.game);
    for (const entity of this.game.entities.byConstructor(MachineEntity)) {
      if (machineSpendsTime(gameState, entity.view())) {
        return true;
      }
    }
    return false;
  }

  /** One sim minute of machine work, over every machine on the floor. */
  private minutePass(): void {
    // One consistent pre-minute snapshot: attendance, dust multipliers,
    // and phase durations all read the world as of the minute's start,
    // exactly like the old pass's single gameState argument.
    const gameState = projectGameState(this.game);
    const completions: OperationCompletion[] = [];
    const dustEmissions: Array<{
      machine: Machine;
      species: ReadonlyArray<DustSpecies>;
      amount: number;
    }> = [];

    for (const entity of this.game.entities.byConstructor(MachineEntity)) {
      const machineState = entity.state;
      if (machineState.operationProgress.status !== "inProgress") {
        continue;
      }

      // Look the operation up through the Machine view so mounted tools'
      // operations resolve too.
      const machine = entity.view();
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
        stationWorkSpeed(machine, gameState),
      );
      const attended = operationAttendanceSatisfied(
        machine,
        selectedOperation,
        gameState,
      );
      const { phaseIndex, ticksRemaining } = machineState.operationProgress;

      // Waiting at a phase boundary: the previous phase is done but the
      // next one is attended and the player wasn't there. Enter it once
      // they are.
      if (ticksRemaining === 0) {
        const nextPhase = phases[phaseIndex + 1];
        if (!nextPhase || (nextPhase.attended && !attended)) {
          continue;
        }
        entity.state = {
          ...machineState,
          operationProgress: {
            status: "inProgress" as const,
            phaseIndex: phaseIndex + 1,
            ticksRemaining: nextPhase.duration,
          },
        };
        continue;
      }

      // Attended phases pause (never cancel) while the player is elsewhere
      const currentPhase = phases[Math.min(phaseIndex, phases.length - 1)];
      if (currentPhase.attended && !attended) {
        continue;
      }

      // The cut is happening this tick, so the sawdust flies now too —
      // hands-free phases (glue curing) make no mess. Scaled exactly as
      // the old pass scaled it.
      const dustOutput = selectedOperation.dustOutput ?? 0;
      if (dustOutput > 0 && currentPhase.attended) {
        const species = [
          ...new Set(
            machineState.processingMaterials.flatMap(materialDustSpecies),
          ),
        ];
        const bagFactor = machineState.tools.includes("dustBag")
          ? 1 - DUST_BAG_CAPTURE
          : 1;
        if (species.length > 0) {
          dustEmissions.push({
            machine,
            species,
            amount:
              (dustOutput * bagFactor * deriveMachineCutLoad(machine)) /
              dustMultiplier,
          });
        }
      }

      const newTicksRemaining = ticksRemaining - 1;

      // Phase still in progress
      if (newTicksRemaining > 0) {
        entity.state = {
          ...machineState,
          operationProgress: {
            ...machineState.operationProgress,
            ticksRemaining: newTicksRemaining,
          },
        };
        continue;
      }

      // Phase finished with more to go: advance, or hold at the boundary
      // if the next phase needs the player and they've stepped away
      if (phaseIndex < phases.length - 1) {
        const nextPhase = phases[phaseIndex + 1];
        const canEnterNext = !nextPhase.attended || attended;
        entity.state = {
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
        continue;
      }

      // Operation completed — through the shared finish commit, so a
      // tick-completed cut and a hand-finished pass do the same things
      const completion = completeOperation(machineState);
      completions.push(completion);
      entity.state = completion.machine;
    }

    // Dust lands after every machine has advanced, like the old pass.
    if (dustEmissions.length > 0) {
      const dustLayer = this.game.entities.tryGetSingleton(DustLayer);
      if (dustLayer) {
        let dust = dustLayer.map;
        for (const emission of dustEmissions) {
          dust = emitMachineDust(
            dust,
            emission.machine,
            emission.species,
            emission.amount,
            gameState.shopInfo.size,
          );
        }
        dustLayer.map = dust;
      }
    }

    if (completions.length > 0) {
      applyCompletionGrants(this.game, completions);
    }
  }
}

/**
 * Whether this machine is actively consuming the player's time this
 * tick — ported verbatim from `src/game/time-flow.ts`.
 */
function machineSpendsTime(gameState: GameState, machine: Machine): boolean {
  const machineState = machine.state;
  if (machineState.operationProgress.status !== "inProgress") {
    return false;
  }
  const operation = machine.operations.find(
    (op) => op.id === machineState.selectedOperationId,
  );
  if (!operation) {
    return false;
  }
  if (!operationAttendanceSatisfied(machine, operation, gameState)) {
    return false;
  }
  const phases = getOperationPhases(
    operation,
    gameState.progression,
    machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
    stationWorkSpeed(machine, gameState),
  );
  const { phaseIndex, ticksRemaining } = machineState.operationProgress;
  const phase =
    ticksRemaining === 0
      ? phases[phaseIndex + 1]
      : phases[Math.min(phaseIndex, phases.length - 1)];
  return phase != null && phase.attended;
}
