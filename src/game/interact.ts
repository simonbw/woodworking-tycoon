import { CellMap } from "./CellMap";
import { readyHandoffs } from "./delivery";
import { GameState, MaterialPile } from "./GameState";
import { heldTool } from "./HeldTool";
import { atTruckBed, atTruckCab } from "./lot";
import { Machine } from "./Machine";
import { getMaterialName } from "./material-helpers";
import { MaterialInstance } from "./Materials";
import { handSpaceLeft } from "./Person";
import { pileWithinReach } from "./pile-helpers";
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
  /** Newest-dropped first, so `piles[0]` is the top of the pile — what a
   * plain press grabs (`targetedPile` applies the rummage offset); Shift
   * takes them all. */
  | { kind: "pick-up-floor"; piles: ReadonlyArray<MaterialPile> }
  | { kind: "pick-up-broom" }
  /** Standing at the truck's bed with cargo in it: E lifts the last
   * piece loaded back out — `material` — and Shift empties the bed. */
  | { kind: "truck-bed"; count: number; material: MaterialInstance }
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
  // still answer — flipping a switch doesn't need a free hand. Full arms
  // step the same verbs aside: the chip never offers a pickup the action
  // would refuse.
  const handsFree =
    heldTool(gameState) === null && handSpaceLeft(gameState.player) > 0;

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

  if (handsFree) {
    // materialPiles keeps drop order (oldest first), and a stack renders
    // in that order too — so the last piece dropped is drawn on top.
    // Reversed here so a plain press takes the top of the pile, and
    // dropping a piece then picking it back up is a round trip.
    const reachable = gameState.materialPiles.filter((pile) =>
      pileWithinReach(pile, gameState.player.position),
    );
    if (reachable.length > 0) {
      return {
        kind: "pick-up-floor",
        piles: reachable.reverse(),
      };
    }
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
    return {
      kind: "truck-bed",
      count: gameState.truck.bed.length,
      // The last piece loaded is the one on top of the heap — what a
      // plain press lifts back out, and what wears the outline.
      material: gameState.truck.bed[gameState.truck.bed.length - 1],
    };
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

/**
 * The piece a press of E takes from a `pick-up-floor` action: the top of
 * the pile by default, stepped through the rest by the rummage offset (R).
 * One helper shared by the keyboard, the outline, and the chip, so all
 * three always name the same piece.
 */
export function targetedPile(
  piles: ReadonlyArray<MaterialPile>,
  offset: number,
): MaterialPile {
  return piles[((offset % piles.length) + piles.length) % piles.length];
}

/**
 * The short verb the hint chip shows for an interact action. A chip names
 * the *thing* the key moves, not the furniture it comes off: "pick up
 * pallet", never "take from makeshift workbench" — you can already see
 * which bench you're standing at.
 */
export function interactLabel(action: InteractAction): string {
  switch (action.kind) {
    case "take-outputs":
      return `take (${action.machine.outputMaterials.length})`;
    case "take-inputs":
      return `pick up ${getMaterialName(action.machine.inputMaterials[0])}`;
    case "switch-on":
      return "switch on";
    case "switch-off":
      return "switch off";
    case "pick-up-floor":
      return "pick up";
    case "pick-up-broom":
      return "pick up broom";
    case "truck-bed":
      return `pick up ${getMaterialName(action.material)}`;
    case "truck-cab":
      return action.handoffCount > 0 ? "deliver work" : "head out";
  }
}
