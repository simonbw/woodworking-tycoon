import React from "react";
import { useUiMode } from "./UiMode";
import {
  useGameState,
  useSaveGame,
  useLoadGame,
  useNewGame,
} from "./useGameState";

export const NavBar: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { storeUnlocked, shopLayoutUnlocked } = gameState.progression;
  const saveGame = useSaveGame();
  const loadGame = useLoadGame();
  const newGame = useNewGame();

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
      <button className="button-ghost" onClick={saveGame}>
        Save
      </button>
      <button className="button-ghost" onClick={loadGame}>
        Load
      </button>
      <button
        className="button-ghost"
        onClick={() => {
          if (
            confirm("Start a new game? This will delete your current save.")
          ) {
            newGame();
          }
        }}
      >
        New Game
      </button>
    </nav>
  );
};
