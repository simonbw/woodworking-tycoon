import React from "react";
import { GameView } from "./GameView";
import { UiModeProvider } from "./UiMode";
import { GameStateProvider } from "./useGameState";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <UiModeProvider>
        <KeyboardShortcuts />
        <GameView />
      </UiModeProvider>
    </GameStateProvider>
  );
};
