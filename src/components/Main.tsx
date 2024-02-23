import React from "react";
import { GameView } from "./GameView";
import { StoreView } from "./StoreView";
import { UiModeProvider, useUiMode } from "./UiMode";
import { ActionKeyContextProvider } from "./consumerCountContext";
import { GameStateProvider } from "./useGameState";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <UiModeProvider>
        <ActionKeyContextProvider>
          <ScreenSwitcher />
        </ActionKeyContextProvider>
      </UiModeProvider>
    </GameStateProvider>
  );
};

const ScreenSwitcher: React.FC = () => {
  const { mode, setMode } = useUiMode();

  switch (mode.mode) {
    case "normal":
      return <GameView />;
    case "store":
      return <StoreView />;
  }
};
