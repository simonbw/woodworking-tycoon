import { GameAction } from "../GameState";
import { CLAMP_COST } from "../Clamp";
import { addConsumables, CONSUMABLE_TYPES, ConsumableId } from "../Consumable";
import { MachineId } from "../Machine";
import { MaterialInstance } from "../Materials";
import { freshMachineState } from "./machine-actions";
import { checkProgressionMilestonesAction } from "./progression-actions";

export function buyMaterialAction(
  material: MaterialInstance,
  price: number,
): GameAction {
  return (gameState) => {
    if (gameState.money < price) {
      console.warn("Tried to buy material without enough money");
      return gameState;
    }
    // Purchases ride home in the truck's bed — they're waiting there
    // when the player pulls back in, not conjured into their hands.
    return {
      ...gameState,
      money: gameState.money - price,
      truck: {
        ...gameState.truck,
        bed: [...gameState.truck.bed, material],
      },
    };
  };
}

/** Buys one pack of a consumable — supplies go straight to the shop stock. */
export function buyConsumablePackAction(
  consumableId: ConsumableId,
): GameAction {
  return (gameState) => {
    const { packSize, packPrice } = CONSUMABLE_TYPES[consumableId];
    if (gameState.money < packPrice) {
      console.warn("Tried to buy supplies without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - packPrice,
      consumables: addConsumables(gameState.consumables, [
        { id: consumableId, amount: packSize },
      ]),
    };
  };
}

/**
 * Buys one clamp. Clamps aren't consumed, so they're sold singly rather
 * than by the pack — you buy the rack up one bar at a time, and each one
 * widens what you can have curing at once (see Clamp.ts).
 */
export function buyClampAction(): GameAction {
  return (gameState) => {
    if (gameState.money < CLAMP_COST) {
      console.warn("Tried to buy a clamp without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - CLAMP_COST,
      clamps: gameState.clamps + 1,
    };
  };
}

export function sellMaterialAction(
  material: MaterialInstance,
  price: number,
): GameAction {
  return (gameState) => {
    if (!gameState.player.inventory.some((item) => item === material)) {
      console.warn("Tried to sell material not in inventory");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money + price,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => item !== material,
        ),
      },
    };
  };
}

export function buyMachineAction(
  machineTypeId: MachineId,
  price: number,
): GameAction {
  return (gameState) => {
    if (gameState.money < price) {
      console.warn("Tried to buy machine without enough money");
      return gameState;
    }

    // The purchase rides home crated in the truck's bed, to be carried
    // into place from there (see machine-actions.ts)
    const updatedState = {
      ...gameState,
      money: gameState.money - price,
      truck: {
        ...gameState.truck,
        crates: [
          ...gameState.truck.crates,
          freshMachineState(machineTypeId, gameState.progression),
        ],
      },
    };

    // Buying gear can reveal manual articles that key on what the shop owns
    // (see MANUAL_ARTICLES) — the milestone check is where that lands.
    return checkProgressionMilestonesAction()(updatedState);
  };
}
