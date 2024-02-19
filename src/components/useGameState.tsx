import React, { ReactNode, createContext, useContext, useState } from "react";
import { GameState } from "../game/GameState";
import { UpdateFunction } from "../utils/typeUtils";
import { initialGameState } from "../game/initialGameState";

const gameStateContext = createContext<
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
  const gameState = useContext(gameStateContext);
  if (gameState === undefined) {
    throw new Error("useGameState must be used within a GameStateProvider");
  }
  return gameState;
}
