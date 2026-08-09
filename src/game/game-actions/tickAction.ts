import { stationWorkSpeed } from "../bench-mounting";
import { deriveMachineCutLoad } from "../cut-load";
import { emitMachineDust, machineDustMultiplier } from "../Dust";
import { DUST_BAG_CAPTURE } from "../tools/dustBag";
import { GameAction, GameState } from "../GameState";
import { DustSpecies } from "../Materials";
import { marketplaceTickPass } from "./marketplace-actions";
import { checkProgressionMilestonesAction } from "./progression-actions";
import { sweepTickPass } from "./dust-actions";
import { shopVacTickPass, vacuumTickPass } from "./shop-vac-actions";
import { combineActions } from "./misc-actions";
import { materialDustSpecies } from "../material-helpers";
import { operationAttendanceSatisfied } from "../machine-helpers";
import { Machine } from "../Machine";
import { getOperationPhases } from "../skill-helpers";
import {
  applyCompletionGrants,
  completeOperation,
  OperationCompletion,
} from "./operation-actions";

/**
 * One simulation tick, as an explicit ordered pipeline. Ordering is
 * load-bearing:
 * - cleaning (the broom's sweep, then the shop vac) runs before machines
 *   emit this tick's dust, so it always cleans the floor as of last tick;
 * - the tick counter advances after machine work (returnTick comparisons
 *   read the pre-advance tick) and before the marketplace (day boundaries
 *   read the post-advance tick);
 * - milestones run last so unlocks that hinge on tick-driven state (a
 *   dusty floor) fire on their own.
 *
 * The marketplace rolls dice every tick, so the tick takes an rng: the
 * real game leaves the default, and the sequence tier pins a seeded one
 * (ShopDriver) so a playthrough lands the same sales every run.
 */
export function tickAction(
  gameState: GameState,
  rng: () => number = Math.random,
): GameState {
  return combineActions(
    playerTickPass(),
    sweepTickPass(),
    vacuumTickPass(),
    shopVacTickPass(),
    machineTickPass(),
    advanceTickPass(),
    marketplaceTickPass(rng),
    checkProgressionMilestonesAction(),
  )(gameState);
}

/**
 * The player's slice of the tick: advance a scavenging trip's legs (a
 * finished search reveals its stop and waits on the player's call) and
 * burn a busy tick. Ending the trip is the player's call, not the
 * clock's — see headHomeFromScavengingAction.
 */
function playerTickPass(): GameAction {
  return (gameState) => {
    const away = gameState.player.away;
    if (
      away?.kind === "scavenging" &&
      away.phase.kind === "searching" &&
      gameState.tick >= away.phase.doneTick
    ) {
      // The half-hour's up: reveal what this stop held. A find was loaded on
      // the spot — the thud is worth hearing — and either way the trip
      // parks at a decision until the player calls the next leg.
      const stop = away.stops[away.stopsSearched];
      gameState = {
        ...gameState,
        player: {
          ...gameState.player,
          away: {
            ...away,
            stopsSearched: away.stopsSearched + 1,
            phase: { kind: "deciding" },
          },
        },
        pendingSounds: stop?.pallet
          ? [...(gameState.pendingSounds ?? []), { kind: "pallet-load" }]
          : gameState.pendingSounds,
      };
    }

    // Still trudging through dust (or mid-sweep): this tick goes to that.
    // Attendance is positional, so a machine the player is standing at
    // keeps running. Busy time doesn't burn down while away — the sweep
    // waits where it was left.
    const busyThisTick = (gameState.player.busyTicks ?? 0) > 0;
    if (busyThisTick && gameState.player.away === null) {
      gameState = {
        ...gameState,
        player: {
          ...gameState.player,
          busyTicks: gameState.player.busyTicks - 1,
        },
      };
    }

    return gameState;
  };
}

/** The tick counter itself. */
function advanceTickPass(): GameAction {
  return (gameState) => ({ ...gameState, tick: gameState.tick + 1 });
}

/**
 * Machines' slice of the tick: every in-progress operation advances (or
 * waits for the player), sheds dust, and on completion delivers outputs,
 * grants (upgrades, crated machines, salvaged supplies), sounds,
 * and craft XP. Attended phases only tick while the player stands at the
 * operation cell; hands-free phases (glue curing) run regardless, even
 * during away trips.
 */
export function machineTickPass(): GameAction {
  return (gameState) => {
    const completions: OperationCompletion[] = [];
    const dustEmissions: Array<{
      machine: Machine;
      species: ReadonlyArray<DustSpecies>;
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
        stationWorkSpeed(machine, gameState),
      );
      // What "attended" takes — presence, grip, power — lives in
      // operationAttendanceSatisfied, shared with the time-flow model so
      // the clock's pace and the work's progress can't disagree.
      const attended = operationAttendanceSatisfied(
        machine,
        selectedOperation,
        gameState,
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
      // its longer run, instead of compounding into a runaway, and scaled up
      // by the cut load — a wide slab sheds more than a skinny strip. A
      // mounted dust bag catches most of it at the port.
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

      // Operation completed — through the shared finish commit, so a
      // tick-completed cut and a hand-finished pass do the same things
      const completion = completeOperation(machineState);
      completions.push(completion);
      return completion.machine;
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

    // Grants (sounds, upgrades, crates, supplies, XP) land through the
    // same application the bench view's finish commit uses.
    return applyCompletionGrants(
      { ...gameState, machines: updatedMachines, dust },
      completions,
    );
  };
}
