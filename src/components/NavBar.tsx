import React from "react";
import { useUiMode } from "./UiMode";
import { useGameState, useQuitToMenu } from "./useGameState";

export const NavBar: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { storeUnlocked, shopLayoutUnlocked } = gameState.progression;
  const quitToMenu = useQuitToMenu();

  return (
    <nav className="flex gap-2 p-2 rounded bg-white/10 w-fit">
      <button
        className={mode.mode === "normal" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "normal" })}
      >
        Home
      </button>
      {storeUnlocked && (
        <button
          className={mode.mode === "store" ? "button" : "button-ghost"}
          onClick={() => setMode({ mode: "store" })}
        >
          Store
        </button>
      )}
      {shopLayoutUnlocked && (
        <button
          className={mode.mode === "shopLayout" ? "button" : "button-ghost"}
          onClick={() => setMode({ mode: "shopLayout" })}
        >
          Shop Layout
        </button>
      )}
      <div className="border-l border-white/20 mx-2" />
      <button
        className="button-ghost"
        onClick={quitToMenu}
        title="Save and return to main menu"
      >
        Save & Quit
      </button>
    </nav>
  );
};
