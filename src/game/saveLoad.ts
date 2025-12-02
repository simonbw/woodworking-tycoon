import { GameState } from "./GameState";

const SAVE_KEY = "woodworking-tycoon-save";
const SAVE_VERSION = 1; // Increment this when GameState structure changes

interface SaveData {
  version: number;
  gameState: GameState;
}

export function saveGame(gameState: GameState): void {
  try {
    const saveData: SaveData = {
      version: SAVE_VERSION,
      gameState,
    };
    const serialized = JSON.stringify(saveData);
    localStorage.setItem(SAVE_KEY, serialized);
    console.log("Game saved successfully");
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

    const saveData = JSON.parse(serialized) as SaveData;

    // Check version - if it doesn't match, the save is incompatible
    if (!saveData.version || saveData.version !== SAVE_VERSION) {
      console.warn("Save file version mismatch, ignoring old save");
      deleteSave();
      return null;
    }

    // Basic validation - ensure required fields exist
    const gameState = saveData.gameState;
    if (
      !gameState ||
      !gameState.machines ||
      !Array.isArray(gameState.machines)
    ) {
      console.warn("Invalid save data structure, ignoring");
      deleteSave();
      return null;
    }

    console.log("Game loaded successfully");
    return gameState;
  } catch (error) {
    console.error("Failed to load game:", error);
    deleteSave();
    return null;
  }
}

export function hasSavedGame(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
  console.log("Save deleted");
}
