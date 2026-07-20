import { GameState } from "./GameState";

const SAVE_KEY = "woodworking-tycoon-save";
const SAVE_VERSION = 11; // Increment this when GameState structure changes

interface SaveData {
  version: number;
  gameState: GameState;
}

export function saveGame(gameState: GameState): void {
  try {
    // pendingSounds is a transient audio queue — never persist it.
    const { pendingSounds: _pendingSounds, ...persisted } = gameState;
    const saveData: SaveData = {
      version: SAVE_VERSION,
      gameState: persisted,
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

    if (saveData.version === 9) {
      saveData.gameState = migrateV9toV10(saveData.gameState);
      saveData.version = 10;
    }

    if (saveData.version === 10) {
      saveData.gameState = migrateV10toV11(saveData.gameState);
      saveData.version = 11;
    }

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
    // Reconstruct the transient, non-persisted audio queue.
    return { ...gameState, pendingSounds: [] };
  } catch (error) {
    console.error("Failed to load game:", error);
    deleteSave();
    return null;
  }
}

/**
 * v9 → v10: the sales table was replaced by the marketplace. Drop any sales
 * tables (their items land at the material dropoff as piles), rename the
 * `freeSelling` flag to `marketplaceUnlocked`, and add the empty marketplace
 * state. Works on the raw parsed JSON, so the old shape is `any` here.
 */
function migrateV9toV10(old: any): GameState {
  const { freeSelling, ...progression } = old.progression;
  const salesTables = old.machines.filter(
    (machine: any) => machine.machineTypeId === "salesTable",
  );
  const strandedMaterials = salesTables.flatMap((machine: any) => [
    ...machine.inputMaterials,
    ...machine.processingMaterials,
    ...machine.outputMaterials,
  ]);
  return {
    ...old,
    machines: old.machines.filter(
      (machine: any) => machine.machineTypeId !== "salesTable",
    ),
    materialPiles: [
      ...old.materialPiles,
      ...strandedMaterials.map((material: any) => ({
        material,
        position: old.shopInfo.materialDropoffPosition,
      })),
    ],
    storage: {
      ...old.storage,
      machines: old.storage.machines.filter(
        (machineId: string) => machineId !== "salesTable",
      ),
    },
    progression: {
      ...progression,
      marketplaceUnlocked: freeSelling ?? false,
    },
    listings: [],
    jobBoard: [],
    acceptedJobs: [],
    categoryDemand: {},
  };
}

/** v10 → v11: machines shed sawdust. Existing saves start with a clean floor. */
function migrateV10toV11(old: any): GameState {
  return { ...old, dust: {} };
}

export function hasSavedGame(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
  console.log("Save deleted");
}
