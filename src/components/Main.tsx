import React, { useEffect, useState } from "react";
import { GameState } from "../game/GameState";
import { saveGame } from "../game/saveLoad";
import { DebugView } from "./DebugView";
import { FixtureLoader } from "./FixtureLoader";
import { GameSoundLayer } from "./GameSoundLayer";
import { HomePage } from "./HomePage";
import { MachineSoundLayer } from "./MachineSoundLayer";
import { MarketplacePage } from "./marketplace-page/MarketplacePage";
import { StartMenu } from "./StartMenu";
import { StorePage } from "./store-page/StorePage";
import { SkillsPage } from "./skills-page/SkillsPage";
import { UiModeProvider, useUiMode } from "./UiMode";
import { UiSoundLayer } from "./UiSoundLayer";
import { ShortcutProvider } from "./shortcuts/ShortcutProvider";
import { ShortcutHelpProvider } from "./shortcuts/ShortcutHelpOverlay";
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
            <ShortcutProvider>
              <ShortcutHelpProvider>
                <ScreenSwitcher />
                <GameSoundLayer />
                <MachineSoundLayer />
                <DebugView />
                <FixtureLoader />
              </ShortcutHelpProvider>
            </ShortcutProvider>
          </UiModeProvider>
        </GameStateProvider>
      )}
    </>
  );
};

const ScreenSwitcher: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { storeUnlocked, marketplaceUnlocked } = gameState.progression;

  // Safety check: if user is in a tab that's no longer unlocked, redirect to home
  useEffect(() => {
    if (mode.mode === "store" && !storeUnlocked) {
      setMode({ mode: "normal" });
    } else if (mode.mode === "marketplace" && !marketplaceUnlocked) {
      setMode({ mode: "normal" });
    }
  }, [mode.mode, storeUnlocked, marketplaceUnlocked, setMode]);

  switch (mode.mode) {
    case "normal":
      return <HomePage />;
    case "store":
      return storeUnlocked ? <StorePage /> : <HomePage />;
    case "marketplace":
      return marketplaceUnlocked ? <MarketplacePage /> : <HomePage />;
    case "skills":
      return <SkillsPage />;
  }
};
