import React, { useState } from "react";
import { GameState } from "../game/GameState";
import { initialGameState } from "../game/initialGameState";
import { deleteSave, getSaveStatus, loadGame } from "../game/saveLoad";
import { MAIN_TITLE_LOGO } from "../utils/uiImages";

interface StartMenuProps {
  onStart: (state: GameState) => void;
}

export const StartMenu: React.FC<StartMenuProps> = ({ onStart }) => {
  const [saveStatus, setSaveStatus] = useState(() => getSaveStatus());
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);

  const handleContinue = () => {
    const saved = loadGame();
    if (saved) {
      onStart(saved);
    } else {
      setSaveStatus(getSaveStatus());
    }
  };

  // The shop saves itself as you work, so by the second session there is
  // almost always something here to lose. That makes this a routine prompt
  // rather than a rare one, which is why it's a card on the workbench and
  // not a browser confirm(). An incompatible save skips the prompt — there
  // is no shop left to keep.
  const handleNewGame = () => {
    if (saveStatus === "ok") {
      setConfirmingNewGame(true);
      return;
    }
    deleteSave();
    onStart(initialGameState);
  };

  const handleConfirmNewGame = () => {
    deleteSave();
    onStart(initialGameState);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 select-none bg-workshop-bg">
      <div className="w-full max-w-md flex flex-col items-center gap-12">
        {/* Hand-painted shop sign */}
        <div className="flex flex-col items-center">
          <span className="font-condensed uppercase tracking-[0.4em] text-paper-manila/50 text-xs mb-3">
            Established 2026
          </span>
          <h1>
            <img
              src={MAIN_TITLE_LOGO}
              alt="Woodworking Tycoon"
              className="w-full max-w-sm drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]"
            />
          </h1>
        </div>

        {/* Menu actions styled as work-order tabs */}
        <div className="w-full flex flex-col gap-3">
          {saveStatus !== "none" && (
            <button
              className="button text-base py-3 tracking-[0.2em]"
              onClick={handleContinue}
              disabled={saveStatus === "incompatible"}
              autoFocus={saveStatus === "ok"}
            >
              Continue
            </button>
          )}
          {saveStatus === "incompatible" && (
            <p
              className="font-typewriter text-xs text-center text-paper-manila/70"
              data-testid="incompatible-save-note"
            >
              This save is from an older version of the game and cannot be
              opened. Starting a new game replaces it.
            </p>
          )}
          <button
            className="button text-base py-3 tracking-[0.2em]"
            onClick={handleNewGame}
            autoFocus={saveStatus !== "ok"}
          >
            New Game
          </button>
        </div>
      </div>

      {confirmingNewGame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
          onClick={() => setConfirmingNewGame(false)}
          role="presentation"
        >
          <div
            className="paper-card w-full max-w-sm flex flex-col gap-5"
            role="dialog"
            aria-modal="true"
            aria-label="Start a new game"
            data-testid="new-game-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-condensed font-bold text-2xl uppercase tracking-wide text-ink-black">
              Clear the shop?
            </h2>
            <p className="font-typewriter text-sm text-ink-black">
              Starting a new game throws out the shop you have now. There is
              only one bench, and this cannot be undone.
            </p>
            <div className="flex items-center justify-between gap-3 border-t-2 border-ink-black/20 pt-4">
              <button
                className="button-paper"
                onClick={() => setConfirmingNewGame(false)}
                data-sfx="ui-back"
                autoFocus
              >
                Keep It
              </button>
              <button
                className="button-paper"
                onClick={handleConfirmNewGame}
                data-testid="confirm-new-game"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
