import { freshMachineState } from "./game-actions/machine-actions";
import { GameState } from "./GameState";
import { MachineId } from "./Machine";
import { defaultEntrancePosition } from "./ShopInfo";

const SAVE_KEY = "woodworking-tycoon-save";
const SAVE_VERSION = 16; // Increment this when GameState structure changes

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

    if (saveData.version === 11) {
      saveData.gameState = migrateV11toV12(saveData.gameState);
      saveData.version = 12;
    }

    if (saveData.version === 12) {
      saveData.gameState = migrateV12toV13(saveData.gameState);
      saveData.version = 13;
    }

    if (saveData.version === 13) {
      saveData.gameState = migrateV13toV14(saveData.gameState);
      saveData.version = 14;
    }

    if (saveData.version === 14) {
      saveData.gameState = migrateV14toV15(saveData.gameState);
      saveData.version = 15;
    }

    if (saveData.version === 15) {
      saveData.gameState = migrateV15toV16(saveData.gameState);
      saveData.version = 16;
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

/** v11 → v12: dust slows work and sweeping exists. */
function migrateV11toV12(old: any): GameState {
  return {
    ...old,
    player: { ...old.player, busyTicks: 0 },
    progression: {
      ...old.progression,
      sweepingUnlocked: false,
      dustTipDismissed: false,
    },
  };
}

/** v12 → v13: the shop vac exists (nobody owns one yet). */
function migrateV12toV13(old: any): GameState {
  return { ...old, shopVac: null };
}

/**
 * v13 → v14: the store-bought makeshift bench became the shop-built small
 * worktable (same footprint, same recipes and more; 3 tool slots covers
 * the bench's 3). Placed benches convert in place; stored ones convert in
 * storage. `storedMaterials` is optional, so no backfill needed.
 */
export function migrateV13toV14(old: any): GameState {
  return {
    ...old,
    machines: old.machines.map((machine: any) =>
      machine.machineTypeId === "makeshiftBench"
        ? { ...machine, machineTypeId: "worktable1x1" }
        : machine,
    ),
    storage: {
      ...old.storage,
      machines: old.storage.machines.map((machineId: string) =>
        machineId === "makeshiftBench" ? "worktable1x1" : machineId,
      ),
    },
  };
}

export function hasSavedGame(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
  console.log("Save deleted");
}

/** v14 → v15: worktable upgrades exist; nobody owns any yet. */
export function migrateV14toV15(old: any): GameState {
  return {
    ...old,
    storage: { ...old.storage, upgrades: [] },
  };
}

/**
 * v15 → v16: the layout editor became the carry system. Abstract machine
 * storage no longer exists — anything stored converts to delivery crates
 * at the shop's (new) entrance, ready to be carried into place.
 */
export function migrateV15toV16(old: any): GameState {
  const { machines: storedMachines, ...storage } = old.storage;
  const entrancePosition = defaultEntrancePosition(old.shopInfo.size);
  return {
    ...old,
    shopInfo: { ...old.shopInfo, entrancePosition },
    machineCrates: (storedMachines as MachineId[]).map((machineTypeId) => ({
      machine: freshMachineState(machineTypeId, old.progression),
      position: entrancePosition,
    })),
    storage,
  };
}
