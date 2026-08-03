import { GameState } from "./GameState";
import { parseGameState } from "./gameStateSchema";

const SAVE_KEY = "woodworking-tycoon-save";

/**
 * Increment when GameState changes shape. There is no migration chain
 * (pre-launch, no players): a version mismatch or a save that fails the
 * schema shows as incompatible on the start menu, and starting a new game
 * writes over it.
 */
const SAVE_VERSION = 13;

export type SaveStatus = "none" | "ok" | "incompatible";

/** Judge the stored save without loading or touching it. */
export function getSaveStatus(): SaveStatus {
  const serialized = localStorage.getItem(SAVE_KEY);
  if (!serialized) {
    return "none";
  }
  try {
    const saveData = JSON.parse(serialized) as Partial<SaveData>;
    if (saveData.version !== SAVE_VERSION) {
      return "incompatible";
    }
    return parseGameState(saveData.gameState) === null ? "incompatible" : "ok";
  } catch {
    return "incompatible";
  }
}

interface SaveData {
  version: number;
  gameState: GameState;
}

export function saveGame(gameState: GameState): void {
  try {
    // pendingSounds and pendingPayouts are transient presentation queues —
    // never persist them, or a reload would replay the last cha-ching.
    const {
      pendingSounds: _pendingSounds,
      pendingPayouts: _pendingPayouts,
      ...persisted
    } = gameState;
    const saveData: SaveData = {
      version: SAVE_VERSION,
      gameState: persisted,
    };
    const serialized = JSON.stringify(saveData);
    localStorage.setItem(SAVE_KEY, serialized);
    // Deliberately silent: autosave calls this several times a second, and
    // console I/O costs far more than the save itself.
  } catch (error) {
    console.error("Failed to save game:", error);
  }
}

export function loadGame(): GameState | null {
  try {
    const serialized = localStorage.getItem(SAVE_KEY);
    if (!serialized) {
      return null;
    }

    // An incompatible save is left in place, not deleted: the start menu
    // reports it, and only starting a new game writes over it.
    const saveData = JSON.parse(serialized) as Partial<SaveData>;
    if (saveData.version !== SAVE_VERSION) {
      console.warn("Save file version mismatch, ignoring old save");
      return null;
    }

    const gameState = parseGameState(saveData.gameState);
    if (gameState === null) {
      console.warn("Invalid save data structure, ignoring");
      return null;
    }

    console.log("Game loaded successfully");
    // Reconstruct the transient, non-persisted presentation queues.
    return { ...gameState, pendingSounds: [], pendingPayouts: [] };
  } catch (error) {
    console.error("Failed to load game:", error);
    return null;
  }
}

export function hasSavedGame(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
