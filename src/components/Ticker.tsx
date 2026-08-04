import React, { useEffect, useRef, useState } from "react";
import { refillEmptyJobBoardAction } from "../game/game-actions/marketplace-actions";
import { checkProgressionMilestonesAction } from "../game/game-actions/progression-actions";
import { combineActions } from "../game/game-actions/misc-actions";
import { tickAction } from "../game/game-actions/tickAction";
import { currentDayPhase, dayTicksSpent, timeSpeed } from "../game/time-flow";
import { TICKS_PER_DAY } from "../game/time";
import { formatCount } from "../utils/formatNumber";
import { TICKS_PER_SECOND, usePaused } from "./PauseContext";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * How fast the clock creeps when nobody is spending time — walking the
 * floor, reading, browsing a store's aisles. Close to real time
 * minute-for-minute: thinking is nearly free, and the day is a budget
 * that work draws down, not a metronome (see docs/time-and-days.md).
 */
const IDLE_TICKS_PER_SECOND = 1 / 60;

/** How often the loop wakes to see whether a tick is owed. */
const LOOP_INTERVAL_MS = 100;

/**
 * Drives the game loop and shows the day as a compact strip docked in
 * the top bar. The clock's pace follows what the player is doing
 * (time-flow.ts): full speed while time is being spent — attended work,
 * a scavenging run, trudging — a near-real-time creep while idle, and a
 * dead stop at night, when the only thing that moves the world is
 * finishing what's already running (or going home to bed). The pause
 * menu still stops everything.
 */
export const Ticker: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { paused, setPaused } = usePaused();
  // Test-only override; null in every real session.
  const [testRate, setTestRate] = useState<number | null>(null);

  const speed = timeSpeed(gameState);
  const ticksPerSecond =
    testRate ??
    (speed === "working"
      ? TICKS_PER_SECOND
      : speed === "idle"
        ? IDLE_TICKS_PER_SECOND
        : 0);

  // Fractional ticks owed so far. Lives across interval restarts so a
  // pace change mid-accumulation doesn't drop what the idle creep had
  // already earned.
  const owed = useRef(0);

  useEffect(() => {
    if (paused || ticksPerSecond === 0) return;
    const interval = setInterval(() => {
      owed.current += ticksPerSecond * (LOOP_INTERVAL_MS / 1000);
      const due = Math.floor(owed.current);
      owed.current -= due;
      for (let i = 0; i < due; i++) {
        applyAction(tickAction);
      }
    }, LOOP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, ticksPerSecond]);

  // Bookkeeping that answers the player's actions rather than the
  // clock: milestone unlocks, the coach's next card, and the empty-board
  // refill used to ride the 5-per-second tick stream, and shouldn't lag
  // just because idle ticks now creep. No time passes here — both
  // actions return the state untouched when there's nothing to do.
  useEffect(() => {
    if (paused) return;
    const bookkeeping = combineActions(
      checkProgressionMilestonesAction(),
      refillEmptyJobBoardAction(),
    );
    const interval = setInterval(() => {
      applyAction(bookkeeping);
    }, 1000 / TICKS_PER_SECOND);
    return () => clearInterval(interval);
  }, [paused]);

  // Test-only clock control. The player has no speed keys, so E2E specs
  // that need a long cure to finish — or a frozen world to set something up
  // in — drive the clock from here instead of racing wall-time.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as any).__SET_PAUSED__ = (value: boolean) => setPaused(value);
    (window as any).__SET_TICK_RATE__ = (rate: number | null) =>
      setTestRate(rate);
    (window as any).__ADVANCE_TICKS__ = (count: number) => {
      for (let i = 0; i < count; i++) applyAction(tickAction);
    };
    return () => {
      delete (window as any).__SET_PAUSED__;
      delete (window as any).__SET_TICK_RATE__;
      delete (window as any).__ADVANCE_TICKS__;
    };
  }, []);

  const phase = currentDayPhase(gameState);
  const dayPercent = Math.min(
    100,
    (dayTicksSpent(gameState) / TICKS_PER_DAY) * 100,
  );

  return (
    <section className="relative flex items-baseline gap-3 pb-1.5">
      {/* Where the day stands — deliberately no wall clock, just the
          light through the garage door. "Night" means the shop is closed
          and the truck is the way to bed. */}
      <span
        data-testid="day-phase"
        className="font-condensed font-bold text-base uppercase leading-none text-paper-manila"
      >
        {phase}
      </span>
      <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] leading-none text-paper-manila/60">
        Day{" "}
        <span className="font-bold text-base tracking-normal text-paper-manila tabular-nums">
          {formatCount(gameState.day)}
        </span>
      </span>
      {/* How far through the day's working minutes the shop is, drawn as
          a hairline along the bottom of the group — the same idiom as
          the XP meter under the Skills button. */}
      <span
        className="absolute inset-x-0 bottom-0 block h-0.5 overflow-hidden rounded-full bg-paper-manila/25"
        aria-hidden
      >
        <span
          style={{ width: dayPercent + "%" }}
          className="block h-full rounded-full bg-gold transition-[width] ease-linear"
        />
      </span>
    </section>
  );
};
