import React from "react";
import { resolveInteract, interactLabel } from "../../game/interact";
import {
  isSameMachine,
  Machine,
  Operation,
  OperationParameter,
  operationParameters,
} from "../../game/Machine";
import { canPickUpMachine } from "../../game/game-actions/machine-actions";
import { heldTool } from "../../game/HeldTool";
import {
  explainFeedRefusal,
  machineCanOperate,
  shopSupply,
  stageableMaterials,
} from "../../game/machine-helpers";
import { hasStationSheet } from "./station-helpers";
import { availableOperations } from "../../game/skill-helpers";
import { HintList, HintRow } from "../shortcuts/HintList";
import { ShortcutKeys } from "../shortcuts/Kbd";
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

  // The E chip shows exactly what the interact key resolved to — but
  // only when its subject is this machine (floor and door hints render
  // next to the player and the door instead).
  const interact = resolveInteract(gameState, machine);
  const interactHere =
    interact != null &&
    "machine" in interact &&
    isSameMachine(interact.machine.state, machine.state)
      ? interact
      : null;

  // The F chip: whether the machine would take what's in hand if we set it
  // down. A switched-off machine takes nothing — E offers the switch first.
  const canStage =
    !isOperating &&
    !switchedOff &&
    stageableMaterials(machine, carried, gameState.progression).length > 0;

  const settings = machineSettings(machine, operations);

  // The Space chip: whether there's something on the machine to run — the
  // shop's supplies and its clamp rack included. A tool in hand owns the
  // Space hold, so the chip stands down rather than lie.
  const canOperate =
    !isOperating &&
    !switchedOff &&
    heldTool(gameState) === null &&
    machineCanOperate(machine, shopSupply(gameState), gameState.progression);

  // Why the cut won't run — the teaching moment that used to live under
  // the sheet's feed button. It advises on the board that's on the machine
  // if there is one ("slide the cut line inside it", "raise the cut
  // height"), and otherwise on what's in hand, so the advice arrives
  // before you've even set the stock down.
  const adviseOn =
    machine.inputMaterials.length > 0 ? machine.inputMaterials : carried;
  const refusal =
    machine.type.directFeed &&
    !isOperating &&
    !canOperate &&
    !switchedOff &&
    adviseOn.length > 0
      ? explainFeedRefusal(machine, operations, adviseOn, gameState.consumables)
      : null;

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
    <HintList>
      <HintRow className="text-paper-manila/60">
        {machine.type.name}
        {status && <> · {status}</>}
      </HintRow>
      {interactHere && (
        <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
          {interactLabel(interactHere)}
        </HintRow>
      )}
      {canStage && (
        <HintRow keys={<ShortcutKeys shortcut="put-down" />}>
          {machine.type.stageVerb ??
            (machine.type.directFeed ? "set stock on it" : "load")}
        </HintRow>
      )}
      {canOperate && (
        <HintRow keys={<ShortcutKeys shortcut="operate-machine" />}>
          hold to {(machine.type.feedVerb ?? "run").toLowerCase()}
        </HintRow>
      )}
      {refusal && (
        <HintRow className="max-w-56 whitespace-normal normal-case italic tracking-normal text-paper-manila/70">
          {refusal}
        </HintRow>
      )}
      {isTargeted(machine) &&
        settings.map((param) => {
          const value =
            machine.selectedParameters?.[param.id] ??
            param.defaultValue ??
            param.values[0];
          return (
            <HintRow
              key={param.id}
              className={isOperating ? "text-paper-manila/70" : undefined}
              // The cranks lock while the machine runs — the setting still
              // reads out, but the keys that turn it stop being offered
              keys={
                isOperating ? (
                  <></>
                ) : param.presentation === "rotate" ? (
                  <ShortcutKeys shortcut="rotate-setting" />
                ) : (
                  <span className="inline-flex items-baseline gap-1">
                    <ShortcutKeys shortcut="setting-down" />
                    <ShortcutKeys shortcut="setting-up" />
                  </span>
                )
              }
            >
              {param.name.toLowerCase()}:{" "}
              <span className="normal-case tabular-nums">
                {typeof value === "number"
                  ? `${value}${param.unit ?? '"'}`
                  : String(value)}
              </span>
            </HintRow>
          );
        })}
      {isTargeted(machine) && hasStationSheet(machine) && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="open-station-sheet" />}
        >
          {machine.type.directFeed
            ? "tool rack"
            : machine.type.container
              ? "contents"
              : "plans & tools"}
        </HintRow>
      )}
      {machines.length > 1 && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="cycle-machine" />}
        >
          next machine ({machines.length} here)
        </HintRow>
      )}
      {liftable && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="carry-machine" />}
        >
          pick up {machine.type.name}
        </HintRow>
      )}
    </HintList>
  );
};

/**
 * The settings the keys drive on this machine, each listed once. A
 * direct-feed machine's settings can belong to any of its operations (the
 * stock in hand decides which runs); a bench only offers the selected
 * plan's. At most one is a "rotate" setting, so R never has to choose.
 */
function machineSettings(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
): ReadonlyArray<OperationParameter> {
  const source = machine.type.directFeed
    ? operations
    : [machine.selectedOperationOrNull].filter((op) => op != null);
  const settings: OperationParameter[] = [];
  for (const op of source) {
    for (const param of operationParameters(op)) {
      if (param.values.length > 1 && !settings.some((s) => s.id === param.id)) {
        settings.push(param);
      }
    }
  }
  return settings;
}

/**
 * Finished stock waiting at the outfeed side of a feed-through machine,
 * offered while the player stands at its outfeed cell.
 */
export const OutfeedChips: React.FC<{ machine: Machine }> = ({ machine }) => (
  <HintList>
    <HintRow className="text-paper-manila/60">
      {machine.type.name} · outfeed
    </HintRow>
    <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
      take ({machine.outputMaterials.length})
    </HintRow>
  </HintList>
);
