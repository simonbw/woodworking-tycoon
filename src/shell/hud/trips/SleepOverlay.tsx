import React, { useEffect, useRef } from "react";
import { TripOverlay } from "../../../components/trip/TripOverlay";
import { beginWakeUp } from "../../../sim/commands/day-commands";
import { useGame, useShopState } from "../../useShell";

/** How long the night card holds before morning comes on its own. */
const NIGHT_BEAT_MS = 2200;

/** The E2E build skips the beat the same way it skips the truck rolls. */
const TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

/* The departure roll's stage gate rejoins with the trip theater; until
 * then the night card owns the screen the moment the trip starts. */

/**
 * The night between days, shown while the player's away trip is the
 * drive home (see TruckPrompt / goHomeAction). There is nothing to do
 * at home — that's the point — so the card holds for a beat and morning
 * arrives on its own: wakeUpAction runs the whole overnight in one
 * batch, and the arrival roll brings the truck back up the driveway.
 */
export const SleepOverlay: React.FC = () => {
  const gameState = useShopState();
  const game = useGame();
  const asleep = gameState.player.away?.kind === "home";
  const settled = true;
  const waking = useRef(false);

  useEffect(() => {
    if (!asleep || !settled) {
      if (!asleep) waking.current = false;
      return;
    }
    const timer = setTimeout(
      () => {
        if (waking.current) return;
        waking.current = true;
        beginWakeUp(game);
      },
      TRANSITIONS_DISABLED ? 0 : NIGHT_BEAT_MS,
    );
    return () => clearTimeout(timer);
  }, [asleep, settled]);

  if (!asleep) {
    return null;
  }

  return (
    // No Head Home handler: the way out of the night is morning, which
    // comes on its own.
    <TripOverlay label="Home for the night" testId="sleep-overlay">
      <div className="m-auto text-center space-y-2">
        <h2 className="font-condensed font-bold text-2xl uppercase tracking-wide text-paper-manila">
          Home for the night
        </h2>
        <p className="font-typewriter text-sm text-paper-manila/70">
          The shop sits quiet till morning.
        </p>
      </div>
    </TripOverlay>
  );
};
