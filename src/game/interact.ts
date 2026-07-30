import { CellMap } from "./CellMap";
import { readyHandoffs } from "./delivery";
import { GameState, MaterialPile } from "./GameState";
import { heldTool } from "./HeldTool";
import { atTruckBed, atTruckCab } from "./lot";
import { Machine } from "./Machine";
import { chebyshevDistance } from "./Vectors";

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
  /** `piles[0]` is what a plain press grabs; Shift takes them all. */
  | { kind: "pick-up-floor"; piles: ReadonlyArray<MaterialPile> }
  | { kind: "pick-up-broom" }
  /** Standing at the truck's bed with cargo in it: E lifts the last
   * piece loaded back out (Shift empties the bed). */
  | { kind: "truck-bed"; count: number }
  /** `handoffCount` is how much finished work is loaded in the bed. */
  | { kind: "truck-cab"; handoffCount: number };

export function resolveInteract(
  gameState: GameState,
  targetedMachine: Machine | undefined,
): InteractAction | null {
  if (gameState.player.away || gameState.player.carriedMachine != null) {
    return null;
  }

  const cellMap = CellMap.fromGameState(gameState);
  const cell = cellMap.at(gameState.player.position);

  // A tool in hand commits the hands: material verbs (take, unload, pick
  // up the floor) step aside until it's set down. Switches and the door
  // still answer — flipping a switch doesn't need a free hand.
  const handsFree = heldTool(gameState) === null;

  const candidates = [targetedMachine, ...(cell?.operableMachines ?? [])]
    .filter((machine) => machine != null)
    // A container is opened, not reached into: what you toss in comes back
    // out through its sheet (Tab). Leaving it off the interact key also
    // keeps a garbage can — reachable from a whole ring of cells, since it
    // has no front — from swallowing E from a board at your feet.
    .filter((machine) => !machine.type.container);

  // Outputs are collected where they land: at this cell for machines
  // whose outfeed points here, at the machine itself for single-point
  // stations (no outputPosition).
  const outputSources = [
    ...(cell?.outputMachines ?? []),
    ...candidates.filter(
      (machine) => machine.type.outputPosition === undefined,
    ),
  ];
  if (handsFree) {
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
  }

  if (
    targetedMachine?.type.powerSwitch === true &&
    !targetedMachine.isPowered
  ) {
    return { kind: "switch-on", machine: targetedMachine };
  }

  if (handsFree && cell?.grabbablePiles.length) {
    return { kind: "pick-up-floor", piles: cell.grabbablePiles };
  }

  // The broom leans where it was left; picking it up needs empty hands
  // (and a free shoulder). Floor pickups outrank it so a pile lying at
  // the broom's feet — the dustpan moment — still gets E first.
  if (
    gameState.broomOwned &&
    handsFree &&
    gameState.player.inventory.length === 0 &&
    gameState.broomPosition !== null &&
    chebyshevDistance(gameState.broomPosition, gameState.player.position) <= 1
  ) {
    return { kind: "pick-up-broom" };
  }

  if (
    handsFree &&
    gameState.truck.bed.length > 0 &&
    atTruckBed(gameState.shopInfo, gameState.player.position)
  ) {
    return { kind: "truck-bed", count: gameState.truck.bed.length };
  }

  // The cab always answers: scavenging is on offer from day one, and
  // finished work in the bed adds its deliveries to the card.
  if (atTruckCab(gameState.shopInfo, gameState.player.position)) {
    return {
      kind: "truck-cab",
      handoffCount: readyHandoffs(gameState).length,
    };
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
    case "pick-up-broom":
      return "pick up broom";
    case "truck-bed":
      return `unload bed (${action.count})`;
    case "truck-cab":
      return action.handoffCount > 0 ? "deliver work" : "head out";
  }
}
