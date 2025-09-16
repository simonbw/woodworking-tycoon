import React, { useEffect } from "react";
import { DebugView } from "./DebugView";
import { HomePage } from "./HomePage";
import { LayoutPage } from "./LayoutPage";
import { StorePage } from "./store-page/StorePage";
import { UiModeProvider, useUiMode } from "./UiMode";
import { ActionKeyContextProvider } from "./consumerCountContext";
import { GameStateProvider, useGameState } from "./useGameState";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <UiModeProvider>
        <ActionKeyContextProvider>
          <ScreenSwitcher />
          <DebugView />
        </ActionKeyContextProvider>
      </UiModeProvider>
    </GameStateProvider>
  );
};

const ScreenSwitcher: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { unlockedTabs } = gameState.progression;

  // Safety check: if user is in a tab that's no longer unlocked, redirect to home
  useEffect(() => {
    if (mode.mode === "store" && !unlockedTabs.includes('store')) {
      setMode({ mode: "normal" });
    } else if (mode.mode === "shopLayout" && !unlockedTabs.includes('layout')) {
      setMode({ mode: "normal" });
    }
  }, [mode.mode, unlockedTabs, setMode]);

  switch (mode.mode) {
    case "normal":
      return <HomePage />;
    case "store":
      return unlockedTabs.includes('store') ? <StorePage /> : <HomePage />;
    case "shopLayout":
      return unlockedTabs.includes('layout') ? <LayoutPage /> : <HomePage />;
  }
};
