import React, { useEffect, useRef, useState } from "react";
import { refillEmptyJobBoardAction } from "../game/game-actions/marketplace-actions";
import { checkProgressionMilestonesAction } from "../game/game-actions/progression-actions";
import { combineActions } from "../game/game-actions/misc-actions";
import { tickAction } from "../game/game-actions/tickAction";
import { timeSpeed } from "../game/time-flow";
import { DayClock } from "./DayClock";
import { TICKS_PER_SECOND, usePaused } from "./PauseContext";
import { useTruckStage } from "./shop-view/truckStageStore";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * How fast the clock creeps when nobody is spending time — walking the
 * floor, reading, browsing a store's aisles. About five times real
 * life, so a full day of pure idling takes around two hours: thinking
 * is nearly free, and deliberately passing time is what the wait key
 * is for (see src/game/time-flow.ts).
 */
const IDLE_TICKS_PER_SECOND = 5 / 60;

/**
 * The wait key's ramp. Holding it starts the clock at a gentle spin and
 * winds it up over a few seconds to twice working pace — the jump from
 * the idle creep lands gradually, and a short tap costs only a few
 * minutes. At full wind a one-hour cure passes in about seven seconds
 * and a whole day in roughly a minute.
 */
const WAIT_START_TICKS_PER_SECOND = 2;
const WAIT_MAX_TICKS_PER_SECOND = 2 * TICKS_PER_SECOND;
const WAIT_RAMP_SECONDS = 5;

/** The wait rate after the key has been held this long. */
function waitTicksPerSecond(heldSeconds: number): number {
  const t = Math.min(1, Math.max(0, heldSeconds / WAIT_RAMP_SECONDS));
  return (
    WAIT_START_TICKS_PER_SECOND +
    t * (WAIT_MAX_TICKS_PER_SECOND - WAIT_START_TICKS_PER_SECOND)
  );
}

/** How often the loop wakes to see whether a tick is owed. */
const LOOP_INTERVAL_MS = 100;

/**
 * Drives the game loop and shows the day as a compact strip docked in
 * the top bar. The clock's pace follows what the player is doing
 * (time-flow.ts): full speed while time is being spent — attended work,
 * a scavenging run, trudging — a slow creep while idle, and a
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
  // The steady paces. Waiting is the odd one out — its rate ramps with
  // how long the key has been held, so it's computed inside the loop.
  const steadyRate =
    testRate ??
    (speed === "working"
      ? TICKS_PER_SECOND
      : speed === "idle"
        ? IDLE_TICKS_PER_SECOND
        : speed === "stopped"
          ? 0
          : null);

  // Fractional ticks owed so far. Lives across interval restarts so a
  // pace change mid-accumulation doesn't drop what the idle creep had
  // already earned.
  const owed = useRef(0);

  // No time passes behind a trip's curtain. The departure and arrival
  // rolls stretch one instant of `player.away` into a few seconds of
  // theater (TripTransitionLayer), and the clock used to run through
  // them — charging the drive a second time on top of the minutes
  // door-actions already books, and burning the first leg of a
  // scavenging trip before its overlay was even on screen.
  const stage = useTruckStage();
  const behindCurtain = stage === "departing" || stage === "arriving";

  useEffect(() => {
    if (paused || behindCurtain || steadyRate === 0) return;
    // The effect re-runs when the speed changes, so this marks the
    // moment the wait key's hold began — the ramp winds up from here.
    const heldSince = performance.now();
    const interval = setInterval(() => {
      const rate =
        steadyRate ??
        waitTicksPerSecond((performance.now() - heldSince) / 1000);
      owed.current += rate * (LOOP_INTERVAL_MS / 1000);
      const due = Math.floor(owed.current);
      owed.current -= due;
      for (let i = 0; i < due; i++) {
        applyAction(tickAction);
      }
    }, LOOP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, behindCurtain, steadyRate, speed]);

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

  // The readout itself is DayClock's — the trip pages show the same one
  // over their own chrome.
  return <DayClock />;
};
