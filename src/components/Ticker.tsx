import React, { useEffect, useState } from "react";
import { tickAction } from "../game/game-actions/tickAction";
import { dayNumber, formatClock, TICKS_PER_DAY } from "../game/time";
import { formatCount } from "../utils/formatNumber";
import { TICKS_PER_SECOND, usePaused } from "./PauseContext";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * Drives the game loop and shows the day as a compact strip docked in the
 * top bar. The shop runs at one pace and the player has no speed control:
 * the phone, journal, and manual are objects you look at while standing in
 * the shop, and a store run takes however long you spend in the aisles.
 * The only thing that stops the clock is the pause menu.
 */
export const Ticker: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { paused, setPaused } = usePaused();
  // Test-only override; null in every real session.
  const [testRate, setTestRate] = useState<number | null>(null);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(
      () => {
        applyAction(tickAction);
      },
      1000 / (testRate ?? TICKS_PER_SECOND),
    );
    return () => clearInterval(interval);
  }, [paused, testRate]);

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

  const day = dayNumber(gameState.tick);
  const dayPercent = ((gameState.tick % TICKS_PER_DAY) / TICKS_PER_DAY) * 100;

  return (
    <section className="relative flex items-baseline gap-3 pb-1.5">
      {/* The wall clock: the anchor for every duration the shop quotes in
          minutes and hours — a 45 min glue-up means nothing without it. */}
      <span
        data-testid="shop-clock"
        className="font-condensed font-bold text-base leading-none text-paper-manila tabular-nums"
      >
        {formatClock(gameState.tick)}
      </span>
      <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] leading-none text-paper-manila/60">
        Day{" "}
        <span className="font-bold text-base tracking-normal text-paper-manila tabular-nums">
          {formatCount(day)}
        </span>
      </span>
      {/* How far through the day the shop is, drawn as a hairline along the
          bottom of the group — the same idiom as the XP meter under the
          Skills button. */}
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
