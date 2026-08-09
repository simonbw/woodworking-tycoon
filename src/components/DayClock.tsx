import React from "react";
import { TICKS_PER_DAY } from "../game/time";
import { currentDayPhase, dayTicksSpent, isNight } from "../game/time-flow";
import { formatCount } from "../utils/formatNumber";
import { DayDial } from "./DayDial";
import { Tooltip } from "./Tooltip";
import { useGameState } from "./useGameState";

/**
 * Where the day stands, told by the sun rather than by a clock face or the
 * name of a phase (`DayDial`): the dial carries the day's progress in its
 * daylight arc, and the day number lives in the tooltip, since the date is
 * the more useful thing to have on screen and both won't fit inside the
 * orbit.
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
