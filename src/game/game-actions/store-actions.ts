import { GameAction } from "../GameState";
import { getActiveCommission } from "../commissionSequence";
import { MachineId } from "../Machine";
import { MaterialInstance } from "../Materials";
import { materialMeetsInput } from "../material-helpers";
import { incrementCommissionsCompletedAction, checkProgressionMilestonesAction } from "./progression-actions";
import { combineActions } from "./misc-actions";
import { withXp } from "./skill-actions";
import { emitSound } from "./sound-actions";

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
  machineTypeId: MachineId,
  price: number
): GameAction {
  return (gameState) => {
    if (gameState.money < price) {
      console.warn("Tried to buy machine without enough money");
      return gameState;
    }

    const updatedState = {
      ...gameState,
      money: gameState.money - price,
      storage: {
        ...gameState.storage,
        machines: [...gameState.storage.machines, machineTypeId],
      },
    };

    // Owning a miter saw unlocks the shop layout tab (see UNLOCK_CONDITIONS)
    return checkProgressionMilestonesAction()(updatedState);
  };
}

/** Completes the active commission if the player has the required materials. */
export function completeCommissionAction(): GameAction {
  return (gameState) => {
    const commission = getActiveCommission(gameState.progression);
    if (!commission) {
      console.warn("No active commission to complete");
      return gameState;
    }

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

    // Commissions teach: chunky XP alongside the payout
    const completedState = withXp(
      emitSound(
        {
          ...gameState,
          money: gameState.money + commission.rewardMoney,
          reputation: gameState.reputation + commission.rewardReputation,
          player: {
            ...gameState.player,
            inventory: updatedInventory,
          },
        },
        { kind: "commission-complete" },
      ),
      Math.round(commission.rewardMoney / 5),
    );

    // Progression must only advance when the commission actually completes
    return combineActions(
      incrementCommissionsCompletedAction(),
      checkProgressionMilestonesAction()
    )(completedState);
  };
}
