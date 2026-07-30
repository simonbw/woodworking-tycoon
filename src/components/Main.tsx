import React, { useState } from "react";
import { GameState } from "../game/GameState";
import { saveGame } from "../game/saveLoad";
import { DebugView } from "./DebugView";
import { FixtureLoader } from "./FixtureLoader";
import { GameSoundLayer } from "./GameSoundLayer";
import { HomePage } from "./HomePage";
import { MachineSoundLayer } from "./MachineSoundLayer";
import { RewardFlightLayer } from "./payout/RewardFlightLayer";
import { StartMenu } from "./StartMenu";
import { TripOverlays, TripTransitionLayer } from "./trip/TripTransitionLayer";
import { UiSoundLayer } from "./UiSoundLayer";
import { ShortcutProvider } from "./shortcuts/ShortcutProvider";
import { PauseProvider } from "./PauseContext";
import { ManualProvider } from "./manual/ManualProvider";
import { BrowserDefaultsGuard } from "./BrowserDefaultsGuard";
import { ClipboardProvider } from "./clipboard/ClipboardProvider";
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
            <PauseProvider>
              <ManualProvider>
                <ClipboardProvider>
                  <BrowserDefaultsGuard />
                  <HomePage />
                  <TripOverlays />
                  <TripTransitionLayer />
                  <RewardFlightLayer />
                  <GameSoundLayer />
                  <MachineSoundLayer />
                  <DebugView />
                  <FixtureLoader />
                </ClipboardProvider>
              </ManualProvider>
            </PauseProvider>
          </ShortcutProvider>
        </GameStateProvider>
      )}
    </>
  );
};
