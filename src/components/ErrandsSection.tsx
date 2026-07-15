import React from "react";
import { startScavengingAction } from "../game/game-actions/scavenge-actions";
import { useApplyGameAction, useGameState } from "./useGameState";

/** Off-site things the player can spend time on, like scavenging for pallets. */
export const ErrandsSection: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  if (!gameState.progression.freeSelling) {
    return null;
  }

  const away = gameState.player.away;
  const ticksLeft = away ? Math.max(0, away.returnTick - gameState.tick) : 0;

  return (
    <section className="space-y-3">
      <h2 className="section-heading">Errands</h2>
      <div className="lined-sheet space-y-2">
        {away ? (
          <p className="italic text-ink-fade text-sm">
            Out scavenging for pallets… back in {ticksLeft} ticks.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="grow text-sm">
              <div>Scavenge for pallets</div>
              <div className="text-xs text-ink-fade">
                Leave the shop for about a quarter of a day. Come back with 1-2
                pallets in whatever shape you find them.
              </div>
            </div>
            <button
              className="button-paper text-xs"
              onClick={() => applyAction(startScavengingAction())}
            >
              Go
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
