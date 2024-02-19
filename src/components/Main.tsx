import React from "react";
import { GameView } from "./GameView";
import { UiModeProvider } from "./UiMode";
import { GameStateProvider } from "./useGameState";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <UiModeProvider>
        <GameView />
      </UiModeProvider>
    </GameStateProvider>
  );
};
