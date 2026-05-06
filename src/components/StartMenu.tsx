import React, { useState } from "react";
import { GameState } from "../game/GameState";
import { initialGameState } from "../game/initialGameState";
import { deleteSave, hasSavedGame, loadGame } from "../game/saveLoad";

interface StartMenuProps {
  onStart: (state: GameState) => void;
}

export const StartMenu: React.FC<StartMenuProps> = ({ onStart }) => {
  const [hasSave, setHasSave] = useState(() => hasSavedGame());

  const handleContinue = () => {
    const saved = loadGame();
    if (saved) {
      onStart(saved);
    } else {
      setHasSave(false);
    }
  };

  const handleNewGame = () => {
    if (hasSave) {
      const ok = confirm(
        "Start a new game? This will delete your current save.",
      );
      if (!ok) return;
      deleteSave();
    }
    onStart(initialGameState);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 select-none bg-workshop-bg">
      <div className="w-full max-w-md flex flex-col items-center gap-12">
        {/* Hand-painted shop sign */}
        <div className="flex flex-col items-center">
          <span className="font-condensed uppercase tracking-[0.4em] text-paper-manila/50 text-xs mb-2">
            Established 2026
          </span>
          <h1 className="font-lumberjack text-6xl text-center text-paper-manila leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
            Woodworking
            <br />
            Tycoon
          </h1>
          <span className="font-stencil tracking-[0.3em] text-gold text-sm mt-3">
            ★ ★ ★
          </span>
        </div>

        {/* Menu actions styled as work-order tabs */}
        <div className="w-full flex flex-col gap-3">
          {hasSave && (
            <button
              className="button text-base py-3 tracking-[0.2em]"
              onClick={handleContinue}
              autoFocus
            >
              Continue
            </button>
          )}
          <button
            className="button text-base py-3 tracking-[0.2em]"
            onClick={handleNewGame}
            autoFocus={!hasSave}
          >
            New Game
          </button>
        </div>
      </div>
    </main>
  );
};
