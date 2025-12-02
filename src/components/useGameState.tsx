import React, { ReactNode, createContext, useContext, useState } from "react";
import { GameState } from "../game/GameState";
import { GameStateView, enrichGameState } from "../game/GameStateView";
import { UpdateFunction } from "../utils/typeUtils";
import { initialGameState } from "../game/initialGameState";
import { loadGame, saveGame, deleteSave } from "../game/saveLoad";

export const gameStateContext = createContext<
  | {
      gameState: GameState;
      updateGameState: UpdateFunction<GameState>;
      saveGame: () => void;
      loadGame: () => void;
      newGame: () => void;
    }
  | undefined
>(undefined);

export const GameStateProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const [gameState, setGameState] = useState<GameState>(() => {
    const savedGame = loadGame();
    return savedGame || initialGameState;
  });

  const handleSaveGame = () => {
    saveGame(gameState);
  };

  const handleLoadGame = () => {
    const savedGame = loadGame();
    if (savedGame) {
      setGameState(savedGame);
    }
  };

  const handleNewGame = () => {
    deleteSave();
    setGameState(initialGameState);
  };

  return (
    <gameStateContext.Provider
      value={{
        gameState,
        updateGameState: setGameState,
        saveGame: handleSaveGame,
        loadGame: handleLoadGame,
        newGame: handleNewGame,
      }}
    >
      {children}
    </gameStateContext.Provider>
  );
};

/**
 * Returns enriched GameStateView with Machine class instances
 * Use this in components for convenient access to machine.type, machine.selectedOperation, etc.
 */
export function useGameState(): GameStateView {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useGameState must be used within a GameStateProvider");
  }
  return enrichGameState(value.gameState);
}

/**
 * Returns raw GameState with MachineState objects
 * Use this in game actions that need to work with serializable state
 */
export function useRawGameState(): GameState {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useRawGameState must be used within a GameStateProvider");
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

export function useSaveGame() {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useSaveGame must be used within a GameStateProvider");
  }
  return value.saveGame;
}

export function useLoadGame() {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useLoadGame must be used within a GameStateProvider");
  }
  return value.loadGame;
}

export function useNewGame() {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useNewGame must be used within a GameStateProvider");
  }
  return value.newGame;
}
