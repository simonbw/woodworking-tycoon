import React from "react";
import { startScavengingAction } from "../game/game-actions/scavenge-actions";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { Thumbtack } from "./Thumbtack";
import { Tooltip } from "./Tooltip";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * Off-site things the player can spend time on, like scavenging for
 * pallets — a handwritten to-do note pinned to the job board.
 */
export const ErrandsSection: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  const away = gameState.player.away;
  const ticksLeft = away ? Math.max(0, away.returnTick - gameState.tick) : 0;
  const canScavenge = gameState.progression.marketplaceUnlocked && !away;

  useShortcut(
    "scavenge",
    () => applyAction(startScavengingAction()),
    canScavenge,
  );

  if (!gameState.progression.marketplaceUnlocked) {
    return null;
  }

  return (
    <div className="relative bg-paper-cream text-ink-black rounded-sm shadow p-3 pt-4 rotate-[0.8deg]">
      <Thumbtack />
      <div className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
        Errands
      </div>
      {away ? (
        <p className="font-ink text-lg text-ink-blue leading-snug py-1">
          Out scavenging for pallets… back in {ticksLeft} ticks.
        </p>
      ) : (
        <div className="flex items-center gap-2 mt-1">
          <div className="grow">
            <div className="font-ink text-lg leading-tight">
              Scavenge for pallets
            </div>
            <div className="text-xs text-ink-fade">
              Leave the shop for about a quarter of a day. Come back with 1-2
              pallets in whatever shape you find them.
            </div>
          </div>
          <Tooltip content="Go scavenging" shortcut="scavenge">
            <button
              className="button-paper text-xs"
              onClick={() => applyAction(startScavengingAction())}
            >
              Go
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
