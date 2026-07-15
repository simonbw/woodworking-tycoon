import React, { useEffect, useState } from "react";
import { GameState } from "../game/GameState";
import { saveGame } from "../game/saveLoad";
import { DebugView } from "./DebugView";
import { FixtureLoader } from "./FixtureLoader";
import { HomePage } from "./HomePage";
import { LayoutPage } from "./LayoutPage";
import { StartMenu } from "./StartMenu";
import { StorePage } from "./store-page/StorePage";
import { UiModeProvider, useUiMode } from "./UiMode";
import { UiSoundLayer } from "./UiSoundLayer";
import { ActionKeyContextProvider } from "./consumerCountContext";
import { GameStateProvider, useGameState } from "./useGameState";

export const Main: React.FC = () => {
  const [activeGame, setActiveGame] = useState<GameState | null>(null);

  const handleQuitToMenu = (finalState: GameState) => {
    saveGame(finalState);
    setActiveGame(null);
  };

  return (
    <>
      <UiSoundLayer />
      {!activeGame ? (
        <StartMenu onStart={setActiveGame} />
      ) : (
        <GameStateProvider
          initialState={activeGame}
          onQuitToMenu={handleQuitToMenu}
        >
          <UiModeProvider>
            <ActionKeyContextProvider>
              <ScreenSwitcher />
              <DebugView />
              <FixtureLoader />
            </ActionKeyContextProvider>
          </UiModeProvider>
        </GameStateProvider>
      )}
    </>
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
