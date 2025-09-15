import { Commission, GameAction } from "../GameState";
import { MachineType } from "../Machine";
import { MaterialInstance } from "../Materials";
import { materialMeetsInput } from "../material-helpers";
import { incrementCommissionsCompletedAction, checkProgressionMilestonesAction } from "./progression-actions";
import { combineActions } from "./misc-actions";

export function buyMaterialAction(
  material: MaterialInstance,
  price: number
): GameAction {
  return (gameState) => {
    if (gameState.money < price) {
      console.warn("Tried to buy material without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - price,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, material],
      },
    };
  };
}

export function sellMaterialAction(
  material: MaterialInstance,
  price: number
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
          (item) => item !== material
        ),
      },
    };
  };
}

export function buyMachineAction(
  machineType: MachineType,
  price: number
): GameAction {
  return (gameState) => {
    if (gameState.money < price) {
      console.warn("Tried to buy machine without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - price,
      storage: {
        ...gameState.storage,
        machines: [...gameState.storage.machines, machineType],
      },
    };
  };
}

export function completeCommissionAction(commission: Commission): GameAction {
  return combineActions(
    (gameState) => {
      // Check if player has all required materials
      for (const requiredMaterial of commission.requiredMaterials) {
        const matchingMaterials = gameState.player.inventory.filter((material) =>
          materialMeetsInput(material, requiredMaterial)
        );
        if (matchingMaterials.length < requiredMaterial.quantity) {
          console.warn("Player doesn't have required materials for commission");
          return gameState;
        }
      }

      // Remove required materials from inventory
      let updatedInventory = [...gameState.player.inventory];
      for (const requiredMaterial of commission.requiredMaterials) {
        let remainingQuantity = requiredMaterial.quantity;
        updatedInventory = updatedInventory.filter((material) => {
          if (remainingQuantity > 0 && materialMeetsInput(material, requiredMaterial)) {
            remainingQuantity--;
            return false; // Remove this material
          }
          return true; // Keep this material
        });
      }

      return {
        ...gameState,
        money: gameState.money + commission.rewardMoney,
        reputation: gameState.reputation + commission.rewardReputation,
        commissions: gameState.commissions.filter((c) => c !== commission),
        player: {
          ...gameState.player,
          inventory: updatedInventory,
        },
      };
    },
    incrementCommissionsCompletedAction(),
    checkProgressionMilestonesAction()
  );
}
