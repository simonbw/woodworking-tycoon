import { Commission, GameAction } from "../GameState";
import { MachineType } from "../Machine";
import { MaterialInstance } from "../Materials";

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
  return (gameState) => {
    return {
      ...gameState,
      money: gameState.money + commission.rewardMoney,
      reputation: gameState.reputation + commission.rewardReputation,
      commissions: gameState.commissions.filter((c) => c !== commission),
    };
  };
}
