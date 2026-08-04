import React, { useEffect, useRef } from "react";
import { wakeUpAction } from "../../game/game-actions/door-actions";
import { useTruckStage } from "../shop-view/truckStageStore";
import { useApplyGameAction, useGameState } from "../useGameState";
import { TripOverlay } from "./TripOverlay";
import { useHeadHome } from "./TripTransitionLayer";

/** How long the night card holds before morning comes on its own. */
const NIGHT_BEAT_MS = 2200;

/** The E2E build skips the beat the same way it skips the truck rolls. */
const TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

/**
 * The night between days, shown while the player's away trip is the
 * drive home (see TruckPrompt / goHomeAction). There is nothing to do
 * at home — that's the point — so the card holds for a beat and morning
 * arrives on its own: wakeUpAction runs the whole overnight in one
 * batch, and the arrival roll brings the truck back up the driveway.
 */
export const SleepOverlay: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const beginReturn = useHeadHome();
  const asleep = gameState.player.away?.kind === "home";
  // The beat starts when the night card actually owns the screen — the
  // departure roll comes first, and waking under it would skip the
  // night entirely.
  const settled = useTruckStage() === "away";
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
        beginReturn(() => applyAction(wakeUpAction()));
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
