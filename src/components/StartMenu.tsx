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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 select-none">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <h1 className="font-lumberjack text-5xl text-center text-amber-100 tracking-wide">
          Woodworking Tycoon
        </h1>

        <div className="w-full flex flex-col gap-3">
          {hasSave && (
            <button
              className="button text-xl py-3"
              onClick={handleContinue}
              autoFocus
            >
              Continue
            </button>
          )}
          <button
            className={
              hasSave ? "button-ghost text-xl py-3" : "button text-xl py-3"
            }
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
