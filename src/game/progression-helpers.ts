import { hasCompletedCommission } from "./commissionSequence";
import { dustTotal } from "./Dust";
import { GameState } from "./GameState";
import { LUMBERYARD_MIN_REPUTATION } from "./lumberStock";
import { MachineId, MachineState } from "./Machine";
import { MaterialInstance } from "./Materials";
import { ToolId } from "./Tool";

/**
 * Floor dust (total units) that puts up the one-time sweeping note — low
 * enough that the first real milling session prompts it.
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
    gameState.truck.crates.some((crate) => crate.machineTypeId === machineId) ||
    gameState.player.carriedMachine?.machineTypeId === machineId
  );
}

/** The tool ids among a batch of loose materials. */
function toolIdsIn(
  materials: ReadonlyArray<MaterialInstance> | undefined,
): ReadonlyArray<ToolId> {
  return (materials ?? []).flatMap((material) =>
    material.type === "tool" ? [material.toolId] : [],
  );
}

/** Everything a machine holds tools-wise: its rack, shelf, and output bay. */
function machineToolIds(machine: MachineState): ReadonlyArray<ToolId> {
  return [
    ...machine.tools,
    ...toolIdsIn(machine.storedMaterials),
    ...toolIdsIn(machine.outputMaterials),
  ];
}

/**
 * Every tool in the shop, mounted or loose. Tools are physical objects, so
 * "owned" means enumerating everywhere one can sit: station racks, shelves
 * and output bays, the arms, floor piles, the truck's bed, and machines
 * mid-carry or still crated.
 */
export function ownedToolIds(gameState: GameState): ReadonlyArray<ToolId> {
  return [
    ...gameState.machines.flatMap(machineToolIds),
    ...gameState.machineCrates.flatMap((crate) =>
      machineToolIds(crate.machine),
    ),
    ...(gameState.player.carriedMachine
      ? machineToolIds(gameState.player.carriedMachine)
      : []),
    ...toolIdsIn(gameState.player.inventory),
    ...toolIdsIn(gameState.materialPiles.map((pile) => pile.material)),
    ...toolIdsIn(gameState.truck.bed),
  ];
}

export function ownsTool(gameState: GameState, toolId: ToolId): boolean {
  return ownedToolIds(gameState).includes(toolId);
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
  | "marketplaceUnlocked"
  | "sweepingUnlocked",
  (gameState: GameState) => boolean
> = {
  storeUnlocked: (gameState) =>
    hasCompletedCommission(gameState.progression, "first-shelf"),
  // Word of the yard gets around once your work has a reputation
  lumberyardUnlocked: (gameState) =>
    gameState.reputation >= LUMBERYARD_MIN_REPUTATION,
  marketplaceUnlocked: (gameState) =>
    hasCompletedCommission(gameState.progression, "cut-to-order"),
  // The sweeping note goes up once there's visibly something to sweep
  sweepingUnlocked: (gameState) =>
    Object.values(gameState.dust).reduce(
      (sum, amounts) => sum + dustTotal(amounts),
      0,
    ) >= DUST_TUTORIAL_THRESHOLD,
};

/**
 * The tutorial stage is derived from which features have been unlocked:
 * 0 = nothing yet, 1 = store unlocked.
 */
export function tutorialStageFor(gameState: GameState): number {
  if (gameState.progression.storeUnlocked) return 1;
  return 0;
}
