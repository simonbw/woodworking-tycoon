import React, { ReactNode, createContext, useContext, useState } from "react";
import { GameState } from "../game/GameState";
import { UpdateFunction } from "../utils/typeUtils";
import { initialGameState } from "../game/initialGameState";

export const gameStateContext = createContext<
  | {
      gameState: GameState;
      updateGameState: UpdateFunction<GameState>;
    }
  | undefined
>(undefined);

export const GameStateProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const [gameState, setGameState] = useState<GameState>(initialGameState);

  return (
    <gameStateContext.Provider
      value={{ gameState, updateGameState: setGameState }}
    >
      {children}
    </gameStateContext.Provider>
  );
};

export function useGameState() {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useGameState must be used within a GameStateProvider");
  }
  return value.gameState;
}

export function useApplyGameAction() {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useGameUpdater must be used within a GameStateProvider");
  }
  return value.updateGameState;
}
