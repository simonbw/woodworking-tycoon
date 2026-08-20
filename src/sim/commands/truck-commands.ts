import { Game } from "../../core/Game";
import { heldTool } from "../../game/HeldTool";
import { atTruckBed } from "../../game/lot";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { carryingShopVac } from "../../game/ShopVac";
import { Player } from "../entities/Player";
import { TruckEntity } from "../entities/TruckEntity";
import { projectGameState } from "../projection";
import { emitSound } from "./sound";

/**
 * Loading and unloading the truck's bed. Everything here happens
 * standing at the bed
 * (atTruckBed) — the tailgate aisle by the garage door or beside the
 * rails — with the same hand rules as the shop floor: a tool in hand
 * commits the hands, a crate takes genuinely empty ones, and the arms
 * hold HAND_CAPACITY pieces. The bed itself is unbounded (see
 * TruckEntity): hauling is the truck's whole job, and the trips between
 * it and the floor are the player's.
 */

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

function truck(game: Game): TruckEntity {
  return game.entities.getSingleton(TruckEntity);
}

/** Heave carried stock over the rail into the bed. */
export function loadTruckBed(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
): boolean {
  const gameState = projectGameState(game);
  if (!atTruckBed(gameState.shopInfo, gameState.player.position)) {
    console.warn("Tried to load the truck from away from the bed");
    return false;
  }
  for (const material of materials) {
    if (!gameState.player.inventory.some((item) => item === material)) {
      console.warn("Tried to load material not in inventory");
      return false;
    }
  }
  const thePlayer = player(game);
  thePlayer.inventory = thePlayer.inventory.filter(
    (item) => !materials.includes(item),
  );
  truck(game).bed.push(...materials);
  emitSound(game, "material-drop");
  return true;
}

/** Lift stock back out of the bed into the player's arms. */
export function takeFromTruckBed(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
): boolean {
  const gameState = projectGameState(game);
  if (!atTruckBed(gameState.shopInfo, gameState.player.position)) {
    console.warn("Tried to unload the truck from away from the bed");
    return false;
  }
  if (heldTool(gameState) !== null) {
    console.warn("Tried to unload the truck while holding a tool");
    return false;
  }
  if (materials.length > handSpaceLeft(gameState.player)) {
    console.warn("Tried to take more than the hands can carry");
    return false;
  }
  const theTruck = truck(game);
  for (const material of materials) {
    if (!theTruck.bed.some((item) => item === material)) {
      console.warn("Tried to take material not in the bed");
      return false;
    }
  }
  const thePlayer = player(game);
  thePlayer.inventory = [...thePlayer.inventory, ...materials];
  theTruck.bed = theTruck.bed.filter((item) => !materials.includes(item));
  emitSound(game, "material-pickup");
  return true;
}

/**
 * Hoist a crated machine out of the bed onto the shoulders — the same
 * carry the shop-floor crates use (see machine-commands.ts), so from
 * here it walks in the door and sets down like any other machine.
 */
export function takeCrateFromTruck(
  game: Game,
  machineTypeId?: string,
): boolean {
  const gameState = projectGameState(game);
  const theTruck = truck(game);
  const crate =
    machineTypeId === undefined
      ? theTruck.crates[0]
      : theTruck.crates.find(
          (candidate) => candidate.machineTypeId === machineTypeId,
        );
  if (!crate || !atTruckBed(gameState.shopInfo, gameState.player.position)) {
    console.warn("No crate in the bed, or too far from it");
    return false;
  }
  const handsFree =
    gameState.player.carriedMachine == null &&
    gameState.player.inventory.length === 0 &&
    !carryingShopVac(gameState);
  if (!handsFree) {
    console.warn("Hands are full");
    return false;
  }
  theTruck.crates = theTruck.crates.filter((candidate) => candidate !== crate);
  player(game).carriedMachine = crate;
  return true;
}
