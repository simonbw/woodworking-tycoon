import { machineDustMultiplier } from "./Dust";
import { GameState } from "./GameState";
import { heldTool } from "./HeldTool";
import { Machine } from "./Machine";
import { operationAttendanceSatisfied } from "./machine-helpers";
import { personCanWork } from "./Person";
import { getOperationPhases } from "./skill-helpers";
import { dayPhase, DayPhase, TICKS_PER_DAY } from "./time";

/**
 * The spend-to-advance clock (see docs/time-and-days.md): the day is a
 * budget of working minutes, and the clock's pace depends on what the
 * player is doing. The Ticker asks this model how fast to feed ticks;
 * the tick pipeline itself never changes.
 *
 *  waiting — the wait key is held: time deliberately spent on nothing.
 *            The rate ramps up the longer the hold (see the Ticker's
 *            waitTicksPerSecond), topping out past working pace. The
 *            easy answer to a cure; every hour waited is an hour not
 *            worked.
 *  working — time is being spent: attended machine work, a busy body
 *            (trudging, sweeping), or a scavenging run's timer. Full
 *            pace, the familiar five minutes a second.
 *  idle    — nobody is spending time. The clock still creeps at about
 *            five times real life (a couple of real hours to idle away
 *            a whole day): thinking is nearly free.
 *  stopped — the shop is closed for the night (or the player is home in
 *            bed). Nothing moves until work finishes it or morning does.
 */
export type TimeSpeed = "waiting" | "working" | "idle" | "stopped";

/** How many of today's working minutes have been spent. */
export function dayTicksSpent(gameState: GameState): number {
  return gameState.tick - gameState.dayStartTick;
}

/** Where today stands, morning through night. */
export function currentDayPhase(gameState: GameState): DayPhase {
  return dayPhase(dayTicksSpent(gameState));
}

/**
 * Whether the shop is closed for the night: the day's budget is spent.
 * Operations already running may finish (working overtime is allowed —
 * the day just doesn't end until you drive home), but nothing new
 * starts and idle time stops passing.
 */
export function isNight(gameState: GameState): boolean {
  return dayTicksSpent(gameState) >= TICKS_PER_DAY;
}

/**
 * Whether this machine is actively consuming the player's time this
 * tick: an in-progress operation whose current phase (or, at a phase
 * boundary, next phase) is attended, with the attendance actually
 * satisfied. Hands-free phases (glue curing) advance whenever ticks flow
 * but never cause them — machines consume time, they don't generate it.
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
    machine.workSpeed,
  );
  const { phaseIndex, ticksRemaining } = machineState.operationProgress;
  const phase =
    ticksRemaining === 0
      ? phases[phaseIndex + 1]
      : phases[Math.min(phaseIndex, phases.length - 1)];
  return phase != null && phase.attended;
}

/** How fast the clock should run right now. */
export function timeSpeed(gameState: GameState): TimeSpeed {
  const away = gameState.player.away;
  // Home in bed: the overnight passes as one batch in wakeUpAction, not
  // as a stream of live ticks.
  if (away?.kind === "home") {
    return "stopped";
  }
  // A scavenging run is spent time with a return tick to reach; browsing
  // a store's aisles is thinking, and thinking is nearly free (the drive
  // there and back carried its own charge).
  if (away?.kind === "scavenging") {
    return "working";
  }
  if (gameState.player.busyTicks > 0 && away === null) {
    return "working";
  }
  // The cleaning tools work by the same hold that runs a machine: the
  // broom's sweep and the vac's pull are ticks spent (mirrors the guard
  // in sweepTickPass / vacuumTickPass).
  if (
    gameState.player.operating === true &&
    heldTool(gameState) !== null &&
    personCanWork(gameState.player)
  ) {
    return "working";
  }
  const machines = gameState.machines.map((state) => new Machine(state));
  if (machines.some((machine) => machineSpendsTime(gameState, machine))) {
    return "working";
  }
  // The wait verb: hold it and the clock spins — but only when nothing
  // else is spending time (working outranks it, so a held wait key can
  // never speed up an attended cut), and never at night, when the day's
  // budget is spent and there's nothing left to give.
  if (gameState.player.waiting === true && !isNight(gameState)) {
    return "waiting";
  }
  return isNight(gameState) ? "stopped" : "idle";
}
