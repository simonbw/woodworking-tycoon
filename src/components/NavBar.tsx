import React from "react";
import { useUiMode } from "./UiMode";
import { useGameState } from "./useGameState";

export const NavBar: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { unlockedTabs } = gameState.progression;

  const isStoreUnlocked = unlockedTabs.includes('store');
  const isLayoutUnlocked = unlockedTabs.includes('layout');

  return (
    <nav className="flex gap-2 p-2 rounded bg-white/10 w-fit">
      <button
        className={mode.mode === "normal" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "normal" })}
      >
        Home
      </button>
      <button
        className={mode.mode === "store" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "store" })}
        disabled={!isStoreUnlocked}
        title={!isStoreUnlocked ? "Complete your first commission to unlock the store" : ""}
      >
        Store
      </button>
      <button
        className={mode.mode === "shopLayout" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "shopLayout" })}
        disabled={!isLayoutUnlocked}
        title={!isLayoutUnlocked ? "Complete more commissions to unlock shop layout editing" : ""}
      >
        Shop Layout
      </button>
    </nav>
  );
};
