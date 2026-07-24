import { CellMap } from "./CellMap";
import { GameState } from "./GameState";
import { Machine } from "./Machine";
import { isAtShopDoor } from "./ShopInfo";

/**
 * What pressing E (the interact key) would do right now. One resolver
 * shared by the keyboard handler and the on-screen hints, so the chip
 * next to the player always names exactly what the key will do.
 *
 * Priority: collect finished work first, then unload a bay, then wake
 * the machine, then the floor, then the door, and only then shut a
 * running machine down (P always toggles power directly).
 */
export type InteractAction =
  | { kind: "take-outputs"; machine: Machine }
  | { kind: "take-inputs"; machine: Machine }
  | { kind: "switch-on"; machine: Machine }
  | { kind: "switch-off"; machine: Machine }
  | { kind: "pick-up-floor" }
  | { kind: "open-door" };

export function resolveInteract(
  gameState: GameState,
  targetedMachine: Machine | undefined,
): InteractAction | null {
  if (gameState.player.away || gameState.player.carriedMachine != null) {
    return null;
  }

  const cellMap = CellMap.fromGameState(gameState);
  const cell = cellMap.at(gameState.player.position);

  const candidates = [
    targetedMachine,
    ...(cell?.operableMachines ?? []),
  ].filter((machine) => machine != null);

  // Outputs are collected where they land: at this cell for machines
  // whose outfeed points here, at the machine itself for single-point
  // stations (no outputPosition).
  const outputSources = [
    ...(cell?.outputMachines ?? []),
    ...candidates.filter(
      (machine) => machine.type.outputPosition === undefined,
    ),
  ];
  for (const machine of outputSources) {
    if (machine.outputMaterials.length > 0) {
      return { kind: "take-outputs", machine };
    }
  }

  for (const machine of candidates) {
    if (machine.inputMaterials.length > 0) {
      return { kind: "take-inputs", machine };
    }
  }

  if (
    targetedMachine?.type.powerSwitch === true &&
    !targetedMachine.isPowered
  ) {
    return { kind: "switch-on", machine: targetedMachine };
  }

  if (cell?.grabbablePiles.length) {
    return { kind: "pick-up-floor" };
  }

  const { storeUnlocked, lumberyardUnlocked, marketplaceUnlocked } =
    gameState.progression;
  if (
    isAtShopDoor(gameState.shopInfo, gameState.player.position) &&
    (storeUnlocked || lumberyardUnlocked || marketplaceUnlocked)
  ) {
    return { kind: "open-door" };
  }

  if (targetedMachine?.type.powerSwitch === true && targetedMachine.isPowered) {
    return { kind: "switch-off", machine: targetedMachine };
  }

  return null;
}

/** The short verb the hint chip shows for an interact action. */
export function interactLabel(action: InteractAction): string {
  switch (action.kind) {
    case "take-outputs":
      return `take (${action.machine.outputMaterials.length})`;
    case "take-inputs":
      return `unload ${action.machine.type.name}`;
    case "switch-on":
      return "switch on";
    case "switch-off":
      return "switch off";
    case "pick-up-floor":
      return "pick up";
    case "open-door":
      return "head out";
  }
}
