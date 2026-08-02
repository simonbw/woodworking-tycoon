import { GameAction } from "../GameState";
import { heldTool } from "../HeldTool";
import { atTruckBed } from "../lot";
import { MaterialInstance } from "../Materials";
import { handSpaceLeft } from "../Person";
import { carryingShopVac } from "../ShopVac";
import { emitSound } from "./sound-actions";

/**
 * Loading and unloading the truck's bed. Everything here happens
 * standing at the bed (atTruckBed) — the tailgate aisle by the garage
 * door or beside the rails — with the same hand rules as the shop floor:
 * a tool in hand commits the hands, a crate takes genuinely empty ones,
 * and the arms hold HAND_CAPACITY pieces. The bed itself is unbounded
 * (see TruckState): hauling is the truck's whole job, and the trips
 * between it and the floor are the player's.
 */

/** Heave carried stock over the rail into the bed. */
export function loadTruckBedAction(
  materials: ReadonlyArray<MaterialInstance>,
): GameAction {
  return (gameState) => {
    if (!atTruckBed(gameState.shopInfo, gameState.player.position)) {
      console.warn("Tried to load the truck from away from the bed");
      return gameState;
    }
    for (const material of materials) {
      if (!gameState.player.inventory.some((item) => item === material)) {
        console.warn("Tried to load material not in inventory");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: gameState.player.inventory.filter(
            (item) => !materials.includes(item),
          ),
        },
        truck: {
          ...gameState.truck,
          bed: [...gameState.truck.bed, ...materials],
        },
      },
      { kind: "material-drop" },
    );
  };
}

/** Lift stock back out of the bed into the player's arms. */
export function takeFromTruckBedAction(
  materials: ReadonlyArray<MaterialInstance>,
): GameAction {
  return (gameState) => {
    if (!atTruckBed(gameState.shopInfo, gameState.player.position)) {
      console.warn("Tried to unload the truck from away from the bed");
      return gameState;
    }
    if (heldTool(gameState) !== null) {
      console.warn("Tried to unload the truck while holding a tool");
      return gameState;
    }
    if (materials.length > handSpaceLeft(gameState.player)) {
      console.warn("Tried to take more than the hands can carry");
      return gameState;
    }
    for (const material of materials) {
      if (!gameState.truck.bed.some((item) => item === material)) {
        console.warn("Tried to take material not in the bed");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: [...gameState.player.inventory, ...materials],
        },
        truck: {
          ...gameState.truck,
          bed: gameState.truck.bed.filter((item) => !materials.includes(item)),
        },
      },
      { kind: "material-pickup" },
    );
  };
}

/**
 * Hoist a crated machine out of the bed onto the shoulders — the same
 * carry the shop-floor crates use (see docs/carrying-machines.md), so
 * from here it walks in the door and sets down like any other machine.
 */
export function takeCrateFromTruckAction(machineTypeId?: string): GameAction {
  return (gameState) => {
    const crate =
      machineTypeId === undefined
        ? gameState.truck.crates[0]
        : gameState.truck.crates.find(
            (candidate) => candidate.machineTypeId === machineTypeId,
          );
    if (!crate || !atTruckBed(gameState.shopInfo, gameState.player.position)) {
      console.warn("No crate in the bed, or too far from it");
      return gameState;
    }
    const handsFree =
      gameState.player.carriedMachine == null &&
      gameState.player.inventory.length === 0 &&
      !carryingShopVac(gameState);
    if (!handsFree) {
      console.warn("Hands are full");
      return gameState;
    }
    return {
      ...gameState,
      truck: {
        ...gameState.truck,
        crates: gameState.truck.crates.filter(
          (candidate) => candidate !== crate,
        ),
      },
      player: { ...gameState.player, carriedMachine: crate },
    };
  };
}
