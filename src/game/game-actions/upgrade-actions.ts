import { GameAction } from "../GameState";
import { isSameMachine, Machine } from "../Machine";
import { UPGRADE_TYPES, UpgradeId } from "../Upgrade";

/** Buys an upgrade at its listed cost; it goes into upgrade storage. */
export function buyUpgradeAction(upgradeId: UpgradeId): GameAction {
  return (gameState) => {
    const cost = UPGRADE_TYPES[upgradeId].cost;
    if (gameState.money < cost) {
      console.warn("Tried to buy upgrade without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - cost,
      storage: {
        ...gameState.storage,
        upgrades: [...gameState.storage.upgrades, upgradeId],
      },
    };
  };
}

/**
 * Installs an upgrade from storage into a worktable's free upgrade slot.
 * Duplicates are allowed and stack — a front vise and a tail vise is a
 * real bench.
 */
export function installUpgradeAction(
  machine: Machine,
  upgradeId: UpgradeId,
): GameAction {
  return (gameState) => {
    if (!gameState.storage.upgrades.includes(upgradeId)) {
      console.warn(`Tried to install ${upgradeId} but it's not in storage`);
      return gameState;
    }
    if (machine.upgrades.length >= (machine.type.upgradeSlots ?? 0)) {
      console.warn(`No free upgrade slots on ${machine.type.name}`);
      return gameState;
    }

    const storageIndex = gameState.storage.upgrades.indexOf(upgradeId);
    const updatedStorage = [
      ...gameState.storage.upgrades.slice(0, storageIndex),
      ...gameState.storage.upgrades.slice(storageIndex + 1),
    ];

    return {
      ...gameState,
      storage: { ...gameState.storage, upgrades: updatedStorage },
      machines: gameState.machines.map((machineState) =>
        isSameMachine(machineState, machine.state)
          ? {
              ...machineState,
              upgrades: [...(machineState.upgrades ?? []), upgradeId],
            }
          : machineState,
      ),
    };
  };
}

/**
 * Uninstalls an upgrade back into storage. Refused while the station is
 * working, and refused when losing the upgrade would strand more mounted
 * tools or shelved stock than the remaining capacity holds — take those
 * off first.
 */
export function uninstallUpgradeAction(
  machine: Machine,
  upgradeId: UpgradeId,
): GameAction {
  return (gameState) => {
    const upgradeIndex = machine.upgrades.indexOf(upgradeId);
    if (upgradeIndex === -1) {
      console.warn(`Tried to uninstall ${upgradeId} but it's not installed`);
      return gameState;
    }
    if (machine.operationProgress.status === "inProgress") {
      console.warn("Can't uninstall upgrades while the station is working");
      return gameState;
    }

    const upgradeType = UPGRADE_TYPES[upgradeId];
    const remainingSlots = machine.toolSlots - (upgradeType.extraToolSlots ?? 0);
    if (machine.state.tools.length > remainingSlots) {
      console.warn("Remove mounted tools before uninstalling the drawers");
      return gameState;
    }
    const remainingSpaces =
      machine.materialStorage - (upgradeType.extraMaterialStorage ?? 0);
    if (machine.storedMaterials.length > remainingSpaces) {
      console.warn("Clear the shelf before uninstalling it");
      return gameState;
    }

    return {
      ...gameState,
      storage: {
        ...gameState.storage,
        upgrades: [...gameState.storage.upgrades, upgradeId],
      },
      machines: gameState.machines.map((machineState) =>
        isSameMachine(machineState, machine.state)
          ? {
              ...machineState,
              upgrades: (machineState.upgrades ?? []).filter(
                (_, index) => index !== upgradeIndex,
              ),
            }
          : machineState,
      ),
    };
  };
}
