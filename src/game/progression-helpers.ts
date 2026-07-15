import { hasCompletedCommission } from "./commissionSequence";
import { GameState } from "./GameState";
import { MachineId } from "./Machine";

export function ownsMachine(
  gameState: GameState,
  machineId: MachineId,
): boolean {
  return (
    gameState.storage.machines.includes(machineId) ||
    gameState.machines.some((m) => m.machineTypeId === machineId)
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
  "storeUnlocked" | "shopLayoutUnlocked" | "freeSelling",
  (gameState: GameState) => boolean
> = {
  storeUnlocked: (gameState) =>
    hasCompletedCommission(gameState.progression, "first-shelf"),
  shopLayoutUnlocked: (gameState) => ownsMachine(gameState, "miterSaw"),
  freeSelling: (gameState) =>
    hasCompletedCommission(gameState.progression, "cut-to-order"),
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
