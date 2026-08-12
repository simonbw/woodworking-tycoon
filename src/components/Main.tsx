import React, { useState } from "react";
import { GameState } from "../game/GameState";
import { saveGame } from "../game/saveLoad";
import { FixtureLoader } from "./FixtureLoader";
import { GameSoundLayer } from "./GameSoundLayer";
import { HoldMusicLayer } from "./HoldMusicLayer";
import { HomePage } from "./HomePage";
import { MachineSoundLayer } from "./MachineSoundLayer";
import { RewardFlightLayer } from "./payout/RewardFlightLayer";
import { StartMenu } from "./StartMenu";
import { TripOverlays, TripTransitionLayer } from "./trip/TripTransitionLayer";
import { TutorialSpotlightLayer } from "./tutorial/TutorialSpotlightLayer";
import { UiSoundLayer } from "./UiSoundLayer";
import { ShortcutProvider } from "./shortcuts/ShortcutProvider";
import { PauseProvider } from "./PauseContext";
import { ManualProvider } from "./manual/ManualProvider";
import { BrowserDefaultsGuard } from "./BrowserDefaultsGuard";
import { GameStateProvider } from "./useGameState";

/**
 * The shop floor is the game's only screen. Everything that used to be a
 * tab is an object reached from it: the manual and journal open as
 * overlays, and the store is a trip out the garage door (a full-screen
 * overlay while the trip lasts).
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
                <BrowserDefaultsGuard />
                {/* HomePage rides inside the transition layer so the
                    walkable store's Head Home can fade through the same
                    dip to black the overlay trips use. */}
                <TripTransitionLayer>
                  <HomePage />
                  <TripOverlays />
                </TripTransitionLayer>
                <RewardFlightLayer />
                {/* Above the overlays, because what it points at is
                    often inside one */}
                <TutorialSpotlightLayer />
                <GameSoundLayer />
                <MachineSoundLayer />
                <HoldMusicLayer />
                <FixtureLoader />
              </ManualProvider>
            </PauseProvider>
          </ShortcutProvider>
        </GameStateProvider>
      )}
    </>
  );
};
