import { CellMap } from "./CellMap";
import { GameState, MaterialPile } from "./GameState";
import { heldTool } from "./HeldTool";
import { atTruckBed, atTruckCab } from "./lot";
import { atStand } from "./stand";
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
  /** Standing at the for-sale stand with pieces on it: E takes the
   * newest one back — `material` — and Shift clears the table. */
  | { kind: "stand"; count: number; material: MaterialInstance }
  | { kind: "truck-cab" };

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

/**
 * The rummage offset that makes `resolveInteract` land on `source` — what
 * the cursor sets when it points at a specific piece, instead of stepping R
 * around the ring until the outline lands on it.
 *
 * Mirrors the resolver's own two cases: with a loaded machine in reach the
 * offset indexes the whole ring, and without one it indexes the floor's
 * pieces alone. `null` when that source isn't in reach at all.
 */
export function offsetForSource(
  gameState: GameState,
  targetedMachine: Machine | undefined,
  source: MaterialSource,
): number | null {
  const sources = materialSources(gameState, targetedMachine);
  const piles = sources.filter((entry) => entry.kind === "floor-pile");
  const ring = sources.length > piles.length ? sources : piles;
  const key = materialSourceKey(source);
  const index = ring.findIndex((entry) => materialSourceKey(entry) === key);
  return index === -1 ? null : index;
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

  if (
    handsFree &&
    gameState.stand.length > 0 &&
    atStand(gameState.shopInfo, gameState.player.position)
  ) {
    return {
      kind: "stand",
      count: gameState.stand.length,
      // The newest piece set out is what a plain press takes back, and
      // what wears the outline.
      material: gameState.stand[gameState.stand.length - 1],
    };
  }

  // The cab always answers: scavenging is on offer from day one.
  if (atTruckCab(gameState.shopInfo, gameState.player.position)) {
    return { kind: "truck-cab" };
  }

  if (targetedMachine?.type.powerSwitch === true && targetedMachine.isPowered) {
    return { kind: "switch-off", machine: targetedMachine };
  }

  return null;
}

/**
 * The short verb the hint chip shows for an interact action — a verb and
 * nothing more wherever the chip's own title already names what the key
 * acts on (the machine's chips are headed by the machine, the bed's by
 * the bed). It never names the furniture something comes off: "take", not
 * "take from makeshift workbench" — you can see which bench you're at. The
 * piece a loaded machine or the bed would hand back does get named, since
 * that's the one thing the title can't say.
 */
export function interactLabel(action: InteractAction): string {
  switch (action.kind) {
    case "take-outputs":
      return `take (${action.machine.outputMaterials.length})`;
    case "take-inputs":
      return `take ${getMaterialName(action.machine.inputMaterials[0])}`;
    case "switch-on":
      return "switch on";
    case "switch-off":
      return "switch off";
    case "pick-up-floor":
      return "pick up";
    case "pick-up-broom":
      return "pick up broom";
    case "truck-bed":
      return `take ${getMaterialName(action.material)}`;
    case "stand":
      return `take back ${getMaterialName(action.material)}`;
    case "truck-cab":
      return "head out";
  }
}
