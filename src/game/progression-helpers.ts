import { hasCompletedCommission } from "./commissionSequence";
import { dustTotal } from "./Dust";
import { GameState } from "./GameState";
import { LUMBERYARD_MIN_REPUTATION } from "./lumberStock";
import { MachineId } from "./Machine";
import { ToolId } from "./Tool";

/**
 * Floor dust (total units) that triggers the sweeping reveal — low enough
 * that the first real milling session brings the broom out.
 */
export const DUST_TUTORIAL_THRESHOLD = 60;

export function ownsMachine(
  gameState: GameState,
  machineId: MachineId,
): boolean {
  return (
    gameState.machines.some((m) => m.machineTypeId === machineId) ||
    gameState.machineCrates.some(
      (crate) => crate.machine.machineTypeId === machineId,
    ) ||
    gameState.player.carriedMachine?.machineTypeId === machineId
  );
}

export function ownsTool(gameState: GameState, toolId: ToolId): boolean {
  return (
    gameState.storage.tools.includes(toolId) ||
    gameState.machines.some((m) => m.tools.includes(toolId))
  );
}

/**
 * Each unlockable feature declares the condition it depends on. Unlocks are
 * one-way: once a flag in ProgressionState is true it stays true, even if the
 * condition later becomes false (e.g. a sold machine).
 *
 * Keyed by the ProgressionState flag the condition controls.
 */
export const UNLOCK_CONDITIONS: Record<
  | "storeUnlocked"
  | "lumberyardUnlocked"
  | "shopLayoutUnlocked"
  | "marketplaceUnlocked"
  | "sweepingUnlocked",
  (gameState: GameState) => boolean
> = {
  storeUnlocked: (gameState) =>
    hasCompletedCommission(gameState.progression, "first-shelf"),
  // Word of the yard gets around once your work has a reputation
  lumberyardUnlocked: (gameState) =>
    gameState.reputation >= LUMBERYARD_MIN_REPUTATION,
  // The flag now gates the carry verb (pick up and move machines on the
  // home screen); the name is kept for save compatibility.
  shopLayoutUnlocked: (gameState) => ownsMachine(gameState, "miterSaw"),
  marketplaceUnlocked: (gameState) =>
    hasCompletedCommission(gameState.progression, "cut-to-order"),
  // The broom comes out once there's visibly something to sweep
  sweepingUnlocked: (gameState) =>
    Object.values(gameState.dust).reduce(
      (sum, amounts) => sum + dustTotal(amounts),
      0,
    ) >= DUST_TUTORIAL_THRESHOLD,
};

/**
 * The tutorial stage is derived from which features have been unlocked:
 * 0 = nothing yet, 1 = store unlocked, 2 = shop layout unlocked.
 */
export function tutorialStageFor(gameState: GameState): number {
  if (gameState.progression.shopLayoutUnlocked) return 2;
  if (gameState.progression.storeUnlocked) return 1;
  return 0;
}
