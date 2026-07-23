import React from "react";
import { SCAVENGE_DURATION_TICKS } from "../game/game-actions/scavenge-actions";
import { Thumbtack } from "./Thumbtack";
import { useGameState } from "./useGameState";

/**
 * A handwritten "back soon" note pinned to the corkboard while the player
 * is out scavenging — the shop-floor record of an absence started at the
 * garage door (see DoorPrompt). Shopping trips don't need one: the store
 * overlay covers the whole screen.
 */
export const AwayNote: React.FC = () => {
  const gameState = useGameState();
  const away = gameState.player.away;
  if (away?.kind !== "scavenging") {
    return null;
  }

  const ticksLeft = Math.max(0, away.returnTick - gameState.tick);
  const progress = 1 - ticksLeft / SCAVENGE_DURATION_TICKS;

  return (
    <div className="relative bg-paper-cream text-ink-black rounded-sm shadow p-3 pt-4 rotate-[0.8deg]">
      <Thumbtack />
      <div className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
        Back soon
      </div>
      <p className="font-ink text-lg text-ink-blue leading-snug py-1">
        Out scavenging for pallets… back in {ticksLeft} ticks.
      </p>
      <div className="relative h-1 rounded-full bg-ink-black/15 overflow-hidden">
        <span
          style={{ width: `${Math.round(progress * 100)}%` }}
          className="absolute inset-y-0 left-0 bg-gold transition-[width] ease-linear"
        />
      </div>
    </div>
  );
};
