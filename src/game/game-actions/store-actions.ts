import { GameAction } from "../GameState";
import { CLAMP_COST } from "../Clamp";
import { addConsumables, CONSUMABLE_TYPES, ConsumableId } from "../Consumable";
import { getActiveCommission } from "../commissionSequence";
import { canHandOff, consumeRequiredMaterials } from "../delivery";
import { MachineId } from "../Machine";
import { MaterialInstance } from "../Materials";
import { deliverMachineCrate, freshMachineState } from "./machine-actions";
import { emitPayout } from "./payout-actions";
import {
  incrementCommissionsCompletedAction,
  checkProgressionMilestonesAction,
} from "./progression-actions";
import { combineActions } from "./misc-actions";
import { withXp } from "./skill-actions";
import { emitSound } from "./sound-actions";

export function buyMaterialAction(
  material: MaterialInstance,
  price: number,
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

    // The purchase arrives crated at the shop entrance, to be carried into
    // place (see docs/carrying-machines.md)
    const updatedState = deliverMachineCrate(
      { ...gameState, money: gameState.money - price },
      freshMachineState(machineTypeId, gameState.progression),
    );

    // Owning a miter saw unlocks machine carrying (see UNLOCK_CONDITIONS)
    return checkProgressionMilestonesAction()(updatedState);
  };
}

/**
 * Hands the active commission over to its client. Called from the garage
 * door (see `DoorPrompt`) — the goods have to be in the player's hands and
 * the player has to be standing at the door, because a commission leaving
 * the shop is a thing that happens somewhere.
 */
export function completeCommissionAction(): GameAction {
  return (gameState) => {
    const commission = getActiveCommission(gameState.progression);
    if (!commission) {
      console.warn("No active commission to complete");
      return gameState;
    }
    if (!canHandOff(gameState)) {
      console.warn("Can't hand work over right now");
      return gameState;
    }

    const updatedInventory = consumeRequiredMaterials(
      gameState.player.inventory,
      commission.requiredMaterials,
    );
    if (updatedInventory === null) {
      console.warn("Player doesn't have required materials for commission");
      return gameState;
    }

    // Commissions teach: chunky XP alongside the payout
    const xp = Math.round(commission.rewardMoney / 5);
    const completedState = withXp(
      emitPayout(
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
        {
          kind: "commission",
          title: commission.name,
          money: commission.rewardMoney,
          reputation: commission.rewardReputation,
          xp,
          client: commission.client,
          dialogue: commission.thanks,
        },
      ),
      xp,
    );

    // Progression must only advance when the commission actually completes
    return combineActions(
      incrementCommissionsCompletedAction(),
      checkProgressionMilestonesAction(),
    )(completedState);
  };
}
