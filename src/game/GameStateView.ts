import { LRUCache } from "typescript-lru-cache";
import { GameState } from "./GameState";
import { Machine } from "./Machine";

/**
 * Enriched view of GameState with Machine class instances instead of MachineState
 * Similar to CellMap pattern - provides convenient access while keeping state serializable
 */
export interface GameStateView extends Omit<GameState, "machines"> {
  readonly machines: ReadonlyArray<Machine>;
}

// Cache enriched views for performance (like CellMap does)
const gameStateViewCache = new LRUCache<GameState, GameStateView>({
  maxSize: 100,
});

/**
 * Enriches GameState by wrapping MachineState objects in Machine class instances
 * Cached for performance - returns same view instance for same GameState
 */
export function enrichGameState(gameState: GameState): GameStateView {
  if (!gameStateViewCache.has(gameState)) {
    const machines = gameState.machines.map(
      (machineState) => new Machine(machineState),
    );

    const view: GameStateView = {
      ...gameState,
      machines,
    };

    gameStateViewCache.set(gameState, view);
  }

  return gameStateViewCache.get(gameState)!;
}
