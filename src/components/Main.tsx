import React from "react";
import { DebugView } from "./DebugView";
import { HomePage } from "./HomePage";
import { LayoutPage } from "./LayoutPage";
import { StorePage } from "./store-page/StorePage";
import { UiModeProvider, useUiMode } from "./UiMode";
import { ActionKeyContextProvider } from "./consumerCountContext";
import { GameStateProvider } from "./useGameState";

export const Main: React.FC = () => {
  return (
    <GameStateProvider>
      <UiModeProvider>
        <ActionKeyContextProvider>
          <ScreenSwitcher />
          <DebugView />
        </ActionKeyContextProvider>
      </UiModeProvider>
    </GameStateProvider>
  );
};

const ScreenSwitcher: React.FC = () => {
  const { mode } = useUiMode();

  switch (mode.mode) {
    case "normal":
      return <HomePage />;
    case "store":
      return <StorePage />;
    case "shopLayout":
      return <LayoutPage />;
  }
};
