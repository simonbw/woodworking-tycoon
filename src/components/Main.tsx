import React from "react";
import { GameView } from "./GameView";
import { UiModeProvider } from "./UiMode";
import { GameStateProvider } from "./useGameState";
import { GlobalKeyboardShortcuts } from "./KeyboardShortcuts";
import { ActionKeyContextProvider } from "./consumerCountContext";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <UiModeProvider>
        <ActionKeyContextProvider>
          <GlobalKeyboardShortcuts />
          <GameView />
        </ActionKeyContextProvider>
      </UiModeProvider>
    </GameStateProvider>
  );
};
