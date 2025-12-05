import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { GameState } from "../game/GameState";
import { UpdateFunction } from "../utils/typeUtils";
import { initialGameState } from "../game/initialGameState";
import { loadGame, saveGame, deleteSave } from "../game/saveLoad";
import { getMachines, Machine } from "../game/Machine";

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

  // Expose game state functions to window for testing and debugging
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__GAME_STATE__ = gameState;
      (window as any).__UPDATE_GAME_STATE__ = setGameState;
      (window as any).__GET_GAME_STATE__ = () => gameState;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__GAME_STATE__;
        delete (window as any).__UPDATE_GAME_STATE__;
        delete (window as any).__GET_GAME_STATE__;
      }
    };
  }, [gameState]);

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
 * Returns raw GameState with MachineState objects
 * Use this for accessing the core game state
 */
export function useGameState(): GameState {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useGameState must be used within a GameStateProvider");
  }
  return value.gameState;
}

/**
 * Returns Machine[] view layer with convenient access to machine.type, machine.selectedOperation, etc.
 * Similar to useCellMap() pattern
 */
export function useMachines(): ReadonlyArray<Machine> {
  const gameState = useGameState();
  return getMachines(gameState.machines);
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
