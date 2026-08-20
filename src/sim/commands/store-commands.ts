import { Game } from "../../core/Game";
import { CLAMP_COST } from "../../game/Clamp";
import {
  addConsumables,
  CONSUMABLE_TYPES,
  ConsumableId,
} from "../../game/Consumable";
import { freshMachineState } from "../../game/game-actions/machine-actions";
import { MachineId } from "../../game/Machine";
import { makeToolItem } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { UPGRADE_TYPES, UpgradeId } from "../../game/Upgrade";
import { TruckEntity } from "../entities/TruckEntity";
import { projectProgression } from "../projection";
import { Consumables } from "../singletons/Consumables";
import { StorageUpgrades } from "../singletons/StorageUpgrades";
import { Wallet } from "../singletons/Wallet";
import { MilestoneSystem } from "../systems/MilestoneSystem";

/**
 * The purchase command surface: every buy the shelves, the tool wall,
 * and the upgrade rack offer. These are what a purchase *does*: money out
 * of the Wallet, the goods to where they land (physical things into the
 * truck's bed, machines crated beside them, supplies and upgrades
 * straight into the shop's stock). Both storefronts ring up through them
 * — the walkable store's register folds its cart through exactly these
 * (see cart-commands.ts), and the lumberyard's menu overlay calls them
 * directly. A refusal logs and returns false.
 */

/**
 * Buy stock off a rack at the price the rack charges. Purchases ride
 * home in the truck's bed — they're waiting there when the player pulls
 * back in, not conjured into their hands.
 */
export function buyMaterial(
  game: Game,
  material: MaterialInstance,
  price: number,
): boolean {
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < price) {
    console.warn("Tried to buy material without enough money");
    return false;
  }
  wallet.money -= price;
  game.entities.getSingleton(TruckEntity).bed.push(material);
  game.dispatch("progressionChanged", {});
  game.dispatch("truckChanged", {});
  return true;
}

/** Buys one pack of a consumable — supplies go straight to the shop stock. */
export function buyConsumablePack(
  game: Game,
  consumableId: ConsumableId,
): boolean {
  const { packSize, packPrice } = CONSUMABLE_TYPES[consumableId];
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < packPrice) {
    console.warn("Tried to buy supplies without enough money");
    return false;
  }
  wallet.money -= packPrice;
  const consumables = game.entities.getSingleton(Consumables);
  consumables.stock = addConsumables(consumables.stock, [
    { id: consumableId, amount: packSize },
  ]);
  game.dispatch("progressionChanged", {});
  game.dispatch("suppliesChanged", {});
  return true;
}

/**
 * Buys one clamp. Clamps aren't consumed, so they're sold singly rather
 * than by the pack — you buy the rack up one bar at a time, and each one
 * widens what you can have curing at once (see Clamp.ts).
 */
export function buyClamp(game: Game): boolean {
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < CLAMP_COST) {
    console.warn("Tried to buy a clamp without enough money");
    return false;
  }
  wallet.money -= CLAMP_COST;
  game.entities.getSingleton(Consumables).clamps += 1;
  game.dispatch("progressionChanged", {});
  game.dispatch("suppliesChanged", {});
  return true;
}

/**
 * Buys a machine. The purchase rides home crated in the truck's bed, to
 * be carried into place from there (see machine-commands.ts /
 * truck-commands.ts).
 */
export function buyMachine(
  game: Game,
  machineTypeId: MachineId,
  price: number,
): boolean {
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < price) {
    console.warn("Tried to buy machine without enough money");
    return false;
  }
  wallet.money -= price;
  game.entities
    .getSingleton(TruckEntity)
    .crates.push(freshMachineState(machineTypeId, projectProgression(game)));
  game.dispatch("progressionChanged", {});
  game.dispatch("truckChanged", {});
  // Buying gear can reveal manual articles that key on what the shop owns
  // (see MANUAL_ARTICLES) — the old action ran the milestone check right
  // here, so the pass runs synchronously rather than waiting a tick.
  game.entities.tryGetSingleton(MilestoneSystem)?.pass();
  return true;
}

/**
 * Buys a tool off the tool wall at its listed cost. Like every other
 * purchase it's a physical thing from here on: it rides home in the
 * truck's bed, gets lifted out at the tailgate, and is carried to the
 * station it'll mount on.
 */
export function buyTool(game: Game, toolId: ToolId): boolean {
  return buyMaterial(game, makeToolItem(toolId), TOOL_TYPES[toolId].cost);
}

/** Buys an upgrade at its listed cost; it goes into upgrade storage. */
export function buyUpgrade(game: Game, upgradeId: UpgradeId): boolean {
  const cost = UPGRADE_TYPES[upgradeId].cost;
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < cost) {
    console.warn("Tried to buy upgrade without enough money");
    return false;
  }
  wallet.money -= cost;
  game.entities.getSingleton(StorageUpgrades).upgrades.push(upgradeId);
  game.dispatch("progressionChanged", {});
  game.dispatch("suppliesChanged", {});
  return true;
}
