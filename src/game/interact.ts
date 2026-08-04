import { CellMap } from "./CellMap";
import { readyHandoffs } from "./delivery";
import { GameState, MaterialPile } from "./GameState";
import { heldTool } from "./HeldTool";
import { atTruckBed, atTruckCab } from "./lot";
import { Machine, machineKey } from "./Machine";
import { getMaterialName } from "./material-helpers";
import { MaterialInstance } from "./Materials";
import { handSpaceLeft } from "./Person";
import { pileWithinReach } from "./pile-helpers";
import { chebyshevDistance } from "./Vectors";
import { mod } from "../utils/mathUtils";

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
  /** Newest-dropped first, so `piles[0]` is the top of the pile. `target`
   * is what a plain press grabs — the top by default, stepped through the
   * rest by the rummage offset (R); Shift takes them all, starting at the
   * target. */
  | {
      kind: "pick-up-floor";
      piles: ReadonlyArray<MaterialPile>;
      target: MaterialPile;
    }
  | { kind: "pick-up-broom" }
  /** Standing at the truck's bed with cargo in it: E lifts the last
   * piece loaded back out — `material` — and Shift empties the bed. */
  | { kind: "truck-bed"; count: number; material: MaterialInstance }
  /** `handoffCount` is how much finished work is loaded in the bed. */
  | { kind: "truck-cab"; handoffCount: number };

/**
 * One place E could take material from: a machine's outfeed, a machine's
 * loaded bay, or a piece lying on the floor. Together they form the ring
 * the rummage key (R) steps through, in the same priority order the
 * resolver would pick them — so a bench's stock never *hides* the board
 * on the floor beside it, it just goes first.
 */
export type MaterialSource =
  | { kind: "take-outputs"; machine: Machine }
  | { kind: "take-inputs"; machine: Machine }
  | { kind: "floor-pile"; pile: MaterialPile };

/** A stable identity for a ring entry, for spotting when the ring itself
 * has changed (a piece taken, a bay emptied, a different machine faced) —
 * that's when the rummage cursor goes back to the top. */
export function materialSourceKey(source: MaterialSource): string {
  switch (source.kind) {
    case "take-outputs":
      return `out:${machineKey(source.machine.state)}`;
    case "take-inputs":
      return `in:${machineKey(source.machine.state)}`;
    case "floor-pile":
      return `pile:${source.pile.material.id}`;
  }
}

/**
 * Every material source in reach, in priority order: outfeeds, then
 * loaded bays, then the floor's pieces newest-first. Empty when the
 * hands aren't free to take anything (a held tool, full arms, a carried
 * machine, or the player away).
 */
export function materialSources(
  gameState: GameState,
  targetedMachine: Machine | undefined,
): ReadonlyArray<MaterialSource> {
  if (gameState.player.away || gameState.player.carriedMachine != null) {
    return [];
  }

  // A tool in hand commits the hands: material verbs (take, unload, pick
  // up the floor) step aside until it's set down. Full arms step the same
  // verbs aside: the chip never offers a pickup the action would refuse.
  const handsFree =
    heldTool(gameState) === null && handSpaceLeft(gameState.player) > 0;
  if (!handsFree) return [];

  const cellMap = CellMap.fromGameState(gameState);
  const cell = cellMap.at(gameState.player.position);

  const candidates = dedupeMachines(
    [targetedMachine, ...(cell?.operableMachines ?? [])]
      .filter((machine) => machine != null)
      // A container is opened, not reached into: what you toss in comes back
      // out through its sheet (Tab). Leaving it off the interact key also
      // keeps a garbage can — reachable from a whole ring of cells, since it
      // has no front — from swallowing E from a board at your feet.
      .filter((machine) => !machine.type.container),
  );

  // Outputs are collected where they land: at this cell for machines
  // whose outfeed points here, at the machine itself for single-point
  // stations (no outputPosition).
  const outputSources = dedupeMachines([
    ...(cell?.outputMachines ?? []),
    ...candidates.filter(
      (machine) => machine.type.outputPosition === undefined,
    ),
  ]);

  const sources: MaterialSource[] = [];
  for (const machine of outputSources) {
    if (machine.outputMaterials.length > 0) {
      sources.push({ kind: "take-outputs", machine });
    }
  }
  for (const machine of candidates) {
    if (machine.inputMaterials.length > 0) {
      sources.push({ kind: "take-inputs", machine });
    }
  }

  // materialPiles keeps drop order (oldest first), and a stack renders
  // in that order too — so the last piece dropped is drawn on top.
  // Reversed here so a plain press takes the top of the pile, and
  // dropping a piece then picking it back up is a round trip.
  const reachable = gameState.materialPiles
    .filter((pile) => pileWithinReach(pile, gameState.player.position))
    .reverse();
  for (const pile of reachable) {
    sources.push({ kind: "floor-pile", pile });
  }

  return sources;
}

function dedupeMachines(machines: ReadonlyArray<Machine>): Machine[] {
  const seen = new Set<string>();
  return machines.filter((machine) => {
    const key = machineKey(machine.state);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveInteract(
  gameState: GameState,
  targetedMachine: Machine | undefined,
  sourceOffset = 0,
): InteractAction | null {
  if (gameState.player.away || gameState.player.carriedMachine != null) {
    return null;
  }

  const sources = materialSources(gameState, targetedMachine);
  const piles = sources
    .filter((source) => source.kind === "floor-pile")
    .map((source) => source.pile);
  const machineSources = sources.length - piles.length;

  // A loaded machine goes first, but doesn't hide the floor: the rummage
  // offset (R) steps the whole ring — the bench's stock, then each piece
  // lying within reach.
  if (machineSources > 0) {
    const source = sources[mod(sourceOffset, sources.length)];
    return source.kind === "floor-pile"
      ? { kind: "pick-up-floor", piles, target: source.pile }
      : source;
  }

  if (
    targetedMachine?.type.powerSwitch === true &&
    !targetedMachine.isPowered
  ) {
    return { kind: "switch-on", machine: targetedMachine };
  }

  if (piles.length > 0) {
    return {
      kind: "pick-up-floor",
      piles,
      target: piles[mod(sourceOffset, piles.length)],
    };
  }

  const handsFree =
    heldTool(gameState) === null && handSpaceLeft(gameState.player) > 0;

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
