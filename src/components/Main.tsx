import React, { useEffect } from "react";
import { DebugView } from "./DebugView";
import { FixtureLoader } from "./FixtureLoader";
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
          <FixtureLoader />
        </ActionKeyContextProvider>
      </UiModeProvider>
    </GameStateProvider>
  );
};

const ScreenSwitcher: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { storeUnlocked, shopLayoutUnlocked } = gameState.progression;

  // Safety check: if user is in a tab that's no longer unlocked, redirect to home
  useEffect(() => {
    if (mode.mode === "store" && !storeUnlocked) {
      setMode({ mode: "normal" });
    } else if (mode.mode === "shopLayout" && !shopLayoutUnlocked) {
      setMode({ mode: "normal" });
    }
  }, [mode.mode, storeUnlocked, shopLayoutUnlocked, setMode]);

  switch (mode.mode) {
    case "normal":
      return <HomePage />;
    case "store":
      return storeUnlocked ? <StorePage /> : <HomePage />;
    case "shopLayout":
      return shopLayoutUnlocked ? <LayoutPage /> : <HomePage />;
  }
};
