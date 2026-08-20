import { stationWorkSpeed } from "./bench-mounting";
import { machineDustMultiplier } from "./Dust";
import { GameState } from "./GameState";
import { heldTool } from "./HeldTool";
import { Machine } from "./Machine";
import { operationAttendanceSatisfied } from "./machine-helpers";
import { personCanWork } from "./Person";
import { getOperationPhases } from "./skill-helpers";
import { dayPhase, DayPhase, TICKS_PER_DAY } from "./time";

/**
 * The spend-to-advance clock: the day is a budget of working minutes,
 * and the clock's pace depends on what the player is doing. TimeFlow
 * asks this model how fast to feed ticks; the tick pipeline itself
 * never changes.
 *
 * Why: in a real-time game with no speed controls, "actions cost time"
 * can never be an economy — the resource spent is the player's
 * real-world patience, and the moments the game is most interesting
 * (planning, reading, arranging) get penalized because the clock runs
 * while you think. Two things fix both problems at once: the clock's
 * pace follows what the player is doing (thinking is nearly free, work
 * costs minutes), and the day ends with the drive home (a budget with a
 * deliberate close, not a metronome).
 *
 *  waiting — the wait key is held: time deliberately spent on nothing.
 *            The rate ramps up the longer the hold (see TimeFlow's
 *            WAIT_START_PACE/WAIT_MAX_PACE/WAIT_RAMP_SECONDS), topping
 *            out past working pace. The easy answer to a cure; every
 *            hour waited is an hour not worked.
 *  working — time is being spent: attended machine work, a busy body
 *            (trudging, sweeping), or a scavenging run's search. Full
 *            pace, the familiar five minutes a second.
 *  idle    — nobody is spending time. The clock still creeps at about
 *            five times real life (a couple of real hours to idle away
 *            a whole day): thinking is nearly free.
 *  stopped — the shop is closed for the night (or the player is home in
 *            bed). Nothing moves until work finishes it or morning does.
 *
 * Machines consume time, they never generate it: hands-free phases
 * (glue curing) advance whenever ticks flow but cause none themselves —
 * a cure finishes on the minutes something else spends. Wait is the
 * easy answer to a cure and the game never punishes it, but every hour
 * waited is an hour not worked, so the skilled play that emerges is
 * filling cures with other work, or gluing up at day's end and letting
 * the overnight do it. The verb teaches the economy by being the
 * baseline efficiency is measured against.
 *
 * The rest of the system, where it lives:
 *  - src/game/time.ts — the day's units (600 working minutes, 840
 *    overnight, 1440 to a calendar day) and phases. Everything the
 *    game quotes "in days" is denominated in calendar days, so
 *    "three days" means three mornings from now.
 *  - src/sim/TimeFlow.ts — the variable-rate loop and the wait ramp;
 *    src/sim/systems/MilestoneSystem.ts — the action-answering cadence
 *    (milestone unlocks) that runs regardless of clock pace.
 *  - src/game/game-actions/door-actions.ts — trips charging for the
 *    drive, and the overnight running as one batch of ordinary ticks.
 *  - src/game/calendar.ts — the derived, presentation-only date.
 *  - src/components/DayDial.tsx — the day told by its light; there is
 *    deliberately no wall clock.
 *  - src/game/daylight.ts — where the sun is, which the dial and the lit
 *    lot both read so they can never disagree.
 *  - src/sim/sequences/day-loop.test.ts — the day loop's promises.
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
    stationWorkSpeed(machine, gameState),
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
  // Home in bed: the overnight passes as one batch on the SleepSystem,
  // not as a stream of live ticks.
  if (away?.kind === "home") {
    return "stopped";
  }
  // A scavenging run's searches are spent time — the half-hour is spent
  // driving to the stop and digging through it. Sitting in the cab
  // deciding whether another is worth it is thinking, and thinking is
  // nearly free — same as browsing a store's aisles, so the decision
  // falls through to the idle creep (or the night stop).
  if (away?.kind === "scavenging" && away.phase.kind === "searching") {
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
