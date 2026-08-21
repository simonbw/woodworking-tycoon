import { Game } from "../../core/Game";
import { UPGRADE_TYPES, UpgradeId } from "../../game/Upgrade";
import { MachineEntity } from "../entities/MachineEntity";
import { StorageUpgrades } from "../singletons/StorageUpgrades";

/**
 * Installing and uninstalling worktable upgrades. Uninstalled upgrades
 * live in the StorageUpgrades singleton; installed ones ride on their
 * station's MachineState, and their effects fold into the Machine view's
 * computed stats. A refusal logs and returns false, and neither command
 * emits a sound. Buying an upgrade belongs to store-commands.ts.
 */

/**
 * Installs an upgrade from storage into a worktable's free upgrade slot.
 * Duplicates are allowed and stack — a front vise and a tail vise is a
 * real bench. Refused while the station is working, like uninstalling.
 */
export function installUpgrade(
  game: Game,
  entity: MachineEntity,
  upgradeId: UpgradeId,
): boolean {
  const storage = game.entities.getSingleton(StorageUpgrades);
  const machine = entity.view();
  if (!storage.upgrades.includes(upgradeId)) {
    console.warn(`Tried to install ${upgradeId} but it's not in storage`);
    return false;
  }
  if (machine.upgrades.length >= (machine.type.upgradeSlots ?? 0)) {
    console.warn(`No free upgrade slots on ${machine.type.name}`);
    return false;
  }
  // An upgrade changes the station's work speed and capacities, so it
  // waits for the current job to come off the bench
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't install upgrades while the station is working");
    return false;
  }

  const storageIndex = storage.upgrades.indexOf(upgradeId);
  storage.upgrades = [
    ...storage.upgrades.slice(0, storageIndex),
    ...storage.upgrades.slice(storageIndex + 1),
  ];
  entity.state = {
    ...entity.state,
    upgrades: [...(entity.state.upgrades ?? []), upgradeId],
  };
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("suppliesChanged", {});
  return true;
}

/**
 * Uninstalls an upgrade back into storage. Refused while the station is
 * working, and refused when losing the upgrade would strand more mounted
 * tools or shelved stock than the remaining capacity holds — take those
 * off first.
 */
export function uninstallUpgrade(
  game: Game,
  entity: MachineEntity,
  upgradeId: UpgradeId,
): boolean {
  const storage = game.entities.getSingleton(StorageUpgrades);
  const machine = entity.view();
  const upgradeIndex = machine.upgrades.indexOf(upgradeId);
  if (upgradeIndex === -1) {
    console.warn(`Tried to uninstall ${upgradeId} but it's not installed`);
    return false;
  }
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't uninstall upgrades while the station is working");
    return false;
  }

  const upgradeType = UPGRADE_TYPES[upgradeId];
  const remainingSlots = machine.toolSlots - (upgradeType.extraToolSlots ?? 0);
  if (entity.state.tools.length > remainingSlots) {
    console.warn("Remove mounted tools before uninstalling the drawers");
    return false;
  }
  const remainingSpaces =
    machine.materialStorage - (upgradeType.extraMaterialStorage ?? 0);
  if (machine.storedMaterials.length > remainingSpaces) {
    console.warn("Clear the shelf before uninstalling it");
    return false;
  }

  storage.upgrades = [...storage.upgrades, upgradeId];
  entity.state = {
    ...entity.state,
    upgrades: (entity.state.upgrades ?? []).filter(
      (_, index) => index !== upgradeIndex,
    ),
  };
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("suppliesChanged", {});
  return true;
}
