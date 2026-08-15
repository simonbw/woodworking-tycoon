import React from "react";
import { DayDial } from "../../components/DayDial";
import { StarIcon } from "../../components/StarIcon";
import { Tooltip } from "../../components/Tooltip";
import { TICKS_PER_DAY } from "../../game/time";
import { currentDayPhase, dayTicksSpent, isNight } from "../../game/time-flow";
import {
  formatCount,
  formatDecimal,
  formatMoney,
} from "../../utils/formatNumber";
import { useShopState } from "../useShell";

/**
 * The top bar — the phase-5 exemplar of the DOM port pattern: the old
 * NavBar's clock and balance segments with `useGameState` swapped for
 * the shell hooks, everything else (markup, classes, the presentational
 * DayDial/StarIcon/Tooltip pieces) reused verbatim. The buttons segment
 * (Skills, the manual, Menu) arrives with the fan-out NavBar port, which
 * absorbs this file.
 */
export const TopBar: React.FC = () => (
  <nav className="pointer-events-none flex items-start justify-end gap-4">
    <div className="hud-chip pointer-events-auto flex items-stretch divide-x divide-workshop-edge">
      <div className="flex items-center px-4 py-1.5">
        <DayClock />
      </div>
      <div className="flex items-center px-4 py-1.5">
        <Balance />
      </div>
    </div>
  </nav>
);

/** The old DayClock over the shell hooks (the loop it rode moved into the engine). */
const DayClock: React.FC = () => {
  const gameState = useShopState();
  const phase = currentDayPhase(gameState);

  return (
    <Tooltip
      content={`${capitalize(phase)} of day ${formatCount(gameState.day)}`}
    >
      <DayDial
        dayProgress={dayTicksSpent(gameState) / TICKS_PER_DAY}
        night={isNight(gameState)}
        phase={phase}
        day={gameState.day}
      />
    </Tooltip>
  );
};

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

/** The old NavBar's Balance segment, verbatim but for the state hook. */
const Balance: React.FC = () => {
  const gameState = useShopState();
  return (
    <section className="flex items-baseline gap-3">
      <div
        className="font-condensed font-bold text-base text-gold tabular-nums leading-none"
        data-reward-target="money"
        data-testid="balance"
      >
        {formatMoney(gameState.money)}
      </div>
      <Tooltip content="Shop reputation — word of your work getting around. It opens better lumber sources.">
        <div
          className="font-condensed font-bold text-base text-gold tabular-nums leading-none"
          data-reward-target="reputation"
          data-testid="reputation"
        >
          <StarIcon className="mr-1" />
          {formatDecimal(gameState.reputation)}
        </div>
      </Tooltip>
    </section>
  );
};
