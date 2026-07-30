import React from "react";
import { MACHINE_ARTICLES } from "../../game/manual";
import { Machine } from "../../game/Machine";
import {
  stowMaterialsInMachineAction,
  takeStoredMaterialsFromMachineAction,
} from "../../game/game-actions/player-actions";
import {
  mountToolAction,
  unmountToolAction,
} from "../../game/game-actions/tool-actions";
import {
  installUpgradeAction,
  uninstallUpgradeAction,
} from "../../game/game-actions/upgrade-actions";
import { UPGRADE_TYPES } from "../../game/Upgrade";
import { TOOL_TYPES } from "../../game/Tool";
import { getMaterialFullName } from "../../game/material-helpers";
import { ToolItem } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { ToolIcon } from "../ItemIcon";
import { ManualLink } from "../manual/ManualLink";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { useApplyGameAction, useGameState } from "../useGameState";

/** The station sheet's pointer to the article that explains this machine. */
export const MachineManualLink: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const article = MACHINE_ARTICLES[machine.state.machineTypeId];
  return article ? <ManualLink article={article} /> : null;
};

/**
 * Tool slots on a workstation: mounted tools come off into the player's
 * arms, and a carried tool can be mounted while slots are free — tools
 * are physical things, so the rack trades with the hands, not a storage
 * list. Mounting a tool adds its operations to the station's Plan list.
 */
export const ToolRack: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (machine.toolSlots === 0) {
    return null;
  }

  const freeSlots = machine.toolSlots - machine.state.tools.length;
  // Tools change what the station can do, so the rack holds still until
  // the running job is off it
  const working = machine.operationProgress.status === "inProgress";
  // A removed tool lands in the arms, so they need a slot free for it
  const handsFull = handSpaceLeft(gameState.player) < 1;
  // What's carried is what can go on the rack
  const mountableTools = gameState.player.inventory
    .filter((item): item is ToolItem => item.type === "tool")
    .filter((tool) => {
      const compatible = TOOL_TYPES[tool.toolId].compatibleMachines;
      return !compatible || compatible.includes(machine.state.machineTypeId);
    });

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          Tools · {machine.state.tools.length}/{machine.toolSlots} slots
        </div>
        <ManualLink article="tools" />
      </div>
      <ul className="divide-y divide-ink-black/15 text-sm">
        {machine.state.tools.map((toolId, index) => (
          <li
            key={`${toolId}-${index}`}
            className="flex items-center gap-2 py-1"
          >
            <ToolIcon
              toolId={toolId}
              className="size-6 shrink-0 [image-rendering:pixelated]"
            />
            <span className="grow">{TOOL_TYPES[toolId].name}</span>
            <button
              className="button-paper text-xs"
              disabled={working || handsFull}
              title={handsFull ? "Hands full" : undefined}
              onClick={() => applyAction(unmountToolAction(machine, toolId))}
            >
              Remove
            </button>
          </li>
        ))}
        {freeSlots > 0 &&
          mountableTools.map((tool) => (
            <li
              key={tool.id}
              className="flex items-center gap-2 py-1 text-ink-fade"
            >
              <ToolIcon
                toolId={tool.toolId}
                className="size-6 shrink-0 opacity-60 [image-rendering:pixelated]"
              />
              <span className="grow">
                {TOOL_TYPES[tool.toolId].name} (in hand)
              </span>
              <button
                className="button-paper text-xs"
                disabled={working}
                onClick={() => applyAction(mountToolAction(machine, tool))}
              >
                Attach
              </button>
            </li>
          ))}
        {machine.state.tools.length === 0 && mountableTools.length === 0 && (
          <li className="py-1 italic text-ink-fade text-xs">
            Empty — carry a tool here to mount it. Tools are sold on the
            store's tool wall.
          </li>
        )}
      </ul>
    </div>
  );
};

/**
 * Upgrade slots on a worktable: installed upgrades can be removed to
 * storage, and stored upgrades installed while slots are free. Effects
 * (speed, tool slots, shelf spaces) fold into the station's stats
 * immediately.
 */
export const UpgradeRack: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const slots = machine.type.upgradeSlots ?? 0;
  if (slots === 0) {
    return null;
  }

  const freeSlots = slots - machine.upgrades.length;
  // Upgrades change the station's speed and capacities, so they wait for
  // the running job the same way tools do
  const working = machine.operationProgress.status === "inProgress";

  return (
    <div className="space-y-1">
      <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        Upgrades · {machine.upgrades.length}/{slots} slots
      </div>
      <ul className="divide-y divide-ink-black/15 text-sm">
        {machine.upgrades.map((upgradeId, index) => (
          <li
            key={`${upgradeId}-${index}`}
            className="flex items-center gap-2 py-1"
          >
            <span className="grow">{UPGRADE_TYPES[upgradeId].name}</span>
            <button
              className="button-paper text-xs"
              disabled={working}
              onClick={() =>
                applyAction(uninstallUpgradeAction(machine, upgradeId))
              }
            >
              Remove
            </button>
          </li>
        ))}
        {freeSlots > 0 &&
          gameState.storage.upgrades.map((upgradeId, index) => (
            <li
              key={`stored-${upgradeId}-${index}`}
              className="flex items-center gap-2 py-1 text-ink-fade"
            >
              <span className="grow">
                {UPGRADE_TYPES[upgradeId].name} (stored)
              </span>
              <button
                className="button-paper text-xs"
                disabled={working}
                onClick={() =>
                  applyAction(installUpgradeAction(machine, upgradeId))
                }
              >
                Install
              </button>
            </li>
          ))}
        {machine.upgrades.length === 0 &&
          gameState.storage.upgrades.length === 0 && (
            <li className="py-1 italic text-ink-fade text-xs">
              No upgrades yet — build drawers and shelves at a bench, or buy a
              vise at the store.
            </li>
          )}
      </ul>
    </div>
  );
};

/**
 * The shelf under a station (MachineType.materialStorage spaces): parked
 * stock, out of the way of the floor and the input bay. Click a stored
 * material to take it back; Stow parks everything you're carrying that
 * fits.
 */
export const MaterialShelf: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (machine.materialStorage === 0) {
    return null;
  }

  const stored = machine.storedMaterials;
  const freeSpaces = machine.materialStorage - stored.length;
  const stowable = gameState.player.inventory.slice(0, freeSpaces);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        <span>
          Shelf · {stored.length}/{machine.materialStorage}
        </span>
        {stowable.length > 0 && (
          <button
            className="button-paper text-xs normal-case tracking-normal"
            onClick={() =>
              applyAction(stowMaterialsInMachineAction(stowable, machine))
            }
          >
            Stow carried ({stowable.length})
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {stored.map((material, index) => (
          <span
            key={index}
            onClick={() =>
              handSpaceLeft(gameState.player) > 0 &&
              applyAction(
                takeStoredMaterialsFromMachineAction([material], machine),
              )
            }
          >
            <MaterialIcon
              material={material}
              tooltip={
                handSpaceLeft(gameState.player) > 0
                  ? `Take: ${getMaterialFullName(material)}`
                  : "Hands full"
              }
            />
          </span>
        ))}
        {stored.length === 0 && (
          <span className="italic text-ink-fade text-xs">
            Empty — stow carried stock here to keep the floor clear.
          </span>
        )}
      </div>
    </div>
  );
};
