import React from "react";
import { GameView } from "./GameView";
import { GameStateProvider } from "./useGameState";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <GameView />
    </GameStateProvider>
  );
};
