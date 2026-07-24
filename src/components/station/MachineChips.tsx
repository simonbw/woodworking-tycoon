import React from "react";
import { resolveInteract, interactLabel } from "../../game/interact";
import {
  Machine,
  MachineOperation,
  ParameterizedOperation,
} from "../../game/Machine";
import { canPickUpMachine } from "../../game/game-actions/machine-actions";
import {
  explainFeedRefusal,
  machineCanOperate,
} from "../../game/machine-helpers";
import { materialMeetsInput } from "../../game/material-helpers";
import {
  getOperationInputMaterials,
  isParameterizedOperation,
} from "../../game/operation-helpers";
import { availableOperations } from "../../game/skill-helpers";
import { HintSurfaceContext, ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { useMachineActivity } from "../shop-view/useMachineActivity";

/**
 * The hint cluster a targeted machine wears: the machine's name and
 * state on one line, then a key chip per verb that applies right now —
 * the same weight as the player's own "[F] put down" hint, nothing
 * card-like. Buttons, scales, and racks live on the station sheet
 * (Enter); the in-world sprite already shows settings physically (the
 * fence rides its rail, the miter head swings).
 */
export const MachineChips: React.FC<{ machine: Machine }> = ({ machine }) => {
  const gameState = useGameState();
  const { machines, isTargeted } = useTargetedMachine();
  const { isOperating, needsYou } = useMachineActivity(machine);

  const operations = availableOperations(machine, gameState.progression);
  const carried = gameState.player.inventory;
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;
  const isBenchLike = !machine.type.directFeed && operations.length > 0;

  // The E chip shows exactly what the interact key resolved to — but
  // only when its subject is this machine (floor and door hints render
  // next to the player and the door instead).
  const interact = resolveInteract(gameState, machine);
  const interactHere =
    interact != null &&
    "machine" in interact &&
    interact.machine.type.name === machine.type.name &&
    interact.machine.position.join(",") === machine.position.join(",")
      ? interact
      : null;

  // The F chip: what presenting the carried stock would do. A
  // switched-off machine takes nothing — E offers the switch first.
  const canFeed =
    machine.type.directFeed &&
    !isOperating &&
    !switchedOff &&
    machineCanOperate(
      machine,
      gameState.consumables,
      carried,
      gameState.progression,
    );
  const refusal =
    machine.type.directFeed &&
    !isOperating &&
    !canFeed &&
    !switchedOff &&
    carried.length > 0
      ? explainFeedRefusal(machine, operations, carried, gameState.consumables)
      : null;
  const selectedOperation = machine.selectedOperationOrNull;
  const canLoad =
    isBenchLike &&
    machine.type.inputSpaces - machine.inputMaterials.length > 0 &&
    selectedOperation != null &&
    carried.some((material) =>
      getOperationInputMaterials(
        selectedOperation,
        machine.selectedParameters,
      ).some((input) => materialMeetsInput(material, input)),
    );

  const firstSetting = firstParameter(machine, operations);
  const settingValue = firstSetting
    ? (machine.selectedParameters?.[firstSetting.id] ??
      firstSetting.defaultValue ??
      firstSetting.values[0])
    : undefined;

  const canOperate =
    isBenchLike && machineCanOperate(machine, gameState.consumables);

  const liftable =
    gameState.progression.shopLayoutUnlocked &&
    gameState.player.carriedMachine == null &&
    canPickUpMachine(gameState, machine.state);

  const status = needsYou ? (
    <span className="text-store-orange">needs you</span>
  ) : isOperating ? (
    <span className="text-green-400">
      {switchedOff ? "paused · off" : "running"}
    </span>
  ) : switchedOff ? (
    "off"
  ) : hasSwitch ? (
    <span className="text-green-400">on</span>
  ) : null;

  return (
    <HintSurfaceContext.Provider value="chrome">
      <ul className="flex flex-col items-center gap-0.5 rounded bg-ink-black/70 px-2 py-1 text-center font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap">
        <li className="text-paper-manila/60">
          {machine.type.name}
          {status && <> · {status}</>}
        </li>
        {interactHere && (
          <li>
            <ShortcutKeys shortcut="pick-up" /> {interactLabel(interactHere)}
          </li>
        )}
        {canFeed && (
          <li>
            <ShortcutKeys shortcut="put-down" />{" "}
            {(machine.type.feedVerb ?? "Feed").toLowerCase()}
          </li>
        )}
        {canLoad && (
          <li>
            <ShortcutKeys shortcut="put-down" /> load
          </li>
        )}
        {canOperate && !isOperating && (
          <li>
            <ShortcutKeys shortcut="operate-machine" />{" "}
            {selectedOperation ? selectedOperation.name.toLowerCase() : "work"}
          </li>
        )}
        {refusal && (
          <li className="max-w-56 whitespace-normal normal-case italic tracking-normal text-paper-manila/70">
            {refusal}
          </li>
        )}
        {firstSetting && isTargeted(machine) && (
          <li>
            <ShortcutKeys shortcut="cycle-parameter" />{" "}
            {firstSetting.name.toLowerCase()}:{" "}
            <span className="font-mono normal-case">
              {typeof settingValue === "number"
                ? `${settingValue}${firstSetting.unit ?? '"'}`
                : String(settingValue)}
            </span>
          </li>
        )}
        {isTargeted(machine) && (
          <li className="text-paper-manila/70">
            <ShortcutKeys shortcut="open-station-sheet" />{" "}
            {isBenchLike ? "plans & tools" : "controls"}
          </li>
        )}
        {machines.length > 1 && (
          <li className="text-paper-manila/70">
            <ShortcutKeys shortcut="cycle-machine" /> next machine (
            {machines.length} here)
          </li>
        )}
        {liftable && (
          <li className="text-paper-manila/70">
            <ShortcutKeys shortcut="carry-machine" /> pick up{" "}
            {machine.type.name}
          </li>
        )}
      </ul>
    </HintSurfaceContext.Provider>
  );
};

/** The first adjustable setting the Z key drives on this machine. */
function firstParameter(
  machine: Machine,
  operations: ReadonlyArray<MachineOperation | ParameterizedOperation>,
) {
  if (machine.type.directFeed) {
    const op = operations.find(
      (candidate) =>
        isParameterizedOperation(candidate) && candidate.parameters.length > 0,
    );
    return op && isParameterizedOperation(op) ? op.parameters[0] : undefined;
  }
  const selected = machine.selectedOperationOrNull;
  return selected && isParameterizedOperation(selected)
    ? selected.parameters[0]
    : undefined;
}

/**
 * Finished stock waiting at the outfeed side of a feed-through machine,
 * offered while the player stands at its outfeed cell.
 */
export const OutfeedChips: React.FC<{ machine: Machine }> = ({ machine }) => (
  <HintSurfaceContext.Provider value="chrome">
    <ul className="flex flex-col items-center gap-0.5 rounded bg-ink-black/70 px-2 py-1 text-center font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap">
      <li className="text-paper-manila/60">{machine.type.name} · outfeed</li>
      <li>
        <ShortcutKeys shortcut="pick-up" /> take (
        {machine.outputMaterials.length})
      </li>
    </ul>
  </HintSurfaceContext.Provider>
);
