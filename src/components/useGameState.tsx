import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { GameState } from "../game/GameState";
import { UpdateFunction } from "../utils/typeUtils";
import { saveGame } from "../game/saveLoad";
import { getMachines, Machine } from "../game/Machine";

export const gameStateContext = createContext<
  | {
      gameState: GameState;
      updateGameState: UpdateFunction<GameState>;
      saveGame: () => void;
      quitToMenu: () => void;
    }
  | undefined
>(undefined);

export const GameStateProvider: React.FC<{
  initialState: GameState;
  onQuitToMenu: (finalState: GameState) => void;
  children?: ReactNode;
}> = ({ initialState, onQuitToMenu, children }) => {
  const [gameState, setGameState] = useState<GameState>(initialState);

  const handleSaveGame = () => {
    saveGame(gameState);
  };

  const handleQuitToMenu = () => {
    onQuitToMenu(gameState);
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
        quitToMenu: handleQuitToMenu,
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

export function useQuitToMenu() {
  const value = useContext(gameStateContext);
  if (value === undefined) {
    throw new Error("useQuitToMenu must be used within a GameStateProvider");
  }
  return value.quitToMenu;
}
