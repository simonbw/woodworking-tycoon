import React, { useState } from "react";
import { GameState } from "../game/GameState";
import { saveGame } from "../game/saveLoad";
import { DebugView } from "./DebugView";
import { FixtureLoader } from "./FixtureLoader";
import { GameSoundLayer } from "./GameSoundLayer";
import { HomePage } from "./HomePage";
import { MachineSoundLayer } from "./MachineSoundLayer";
import { StartMenu } from "./StartMenu";
import { StoreTripOverlay } from "./store-page/StoreTripOverlay";
import { UiSoundLayer } from "./UiSoundLayer";
import { ShortcutProvider } from "./shortcuts/ShortcutProvider";
import { TickSpeedProvider } from "./TickSpeedContext";
import { ManualProvider } from "./manual/ManualProvider";
import { GameStateProvider } from "./useGameState";

/**
 * The shop floor is the game's only screen. Everything that used to be a
 * tab is an object reached from it: the manual and journal open as
 * overlays, the marketplace lives on the phone, and the store is a trip
 * out the garage door (a full-screen overlay while the trip lasts).
 */
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
          <ShortcutProvider>
            <TickSpeedProvider>
              <ManualProvider>
                <HomePage />
                <StoreTripOverlay />
                <GameSoundLayer />
                <MachineSoundLayer />
                <DebugView />
                <FixtureLoader />
              </ManualProvider>
            </TickSpeedProvider>
          </ShortcutProvider>
        </GameStateProvider>
      )}
    </>
  );
};
