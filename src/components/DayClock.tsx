import React from "react";
import { TICKS_PER_DAY } from "../game/time";
import { currentDayPhase, dayTicksSpent } from "../game/time-flow";
import { formatCount } from "../utils/formatNumber";
import { useGameState } from "./useGameState";

/**
 * Where the day stands: the light through the garage door, the day
 * number, and a hairline of how far through the working minutes the shop
 * is — the same idiom as the XP meter under the Skills button.
 * Deliberately no wall clock. "Night" means the shop is closed and the
 * truck is the way to bed.
 *
 * Lives on its own because it isn't only the top bar's: an away trip
 * covers the HUD, and the player still has to weigh another stop against
 * the daylight left, so the trip pages show this exact readout rather
 * than inventing a second way to tell time (see `ScavengeTripOverlay`).
 * The game loop that moves it is `Ticker`, which renders one of these.
 */
export const DayClock: React.FC = () => {
  const gameState = useGameState();
  const phase = currentDayPhase(gameState);
  const dayPercent = Math.min(
    100,
    (dayTicksSpent(gameState) / TICKS_PER_DAY) * 100,
  );

  return (
    <section className="relative flex items-baseline gap-3 pb-1.5">
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
