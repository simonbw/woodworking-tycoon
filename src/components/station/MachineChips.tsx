import React from "react";
import {
  interactLabel,
  materialSources,
  resolveInteract,
} from "../../game/interact";
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
  findFeedableOperation,
  liveSettingParameter,
  machineCanOperate,
  orientedOperations,
  shopSupply,
  stageableMaterials,
} from "../../game/machine-helpers";
import { getMaterialName } from "../../game/material-helpers";
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
  const { machines, isTargeted, pileOffset } = useTargetedMachine();
  const { isOperating, needsYou } = useMachineActivity(machine);

  const operations = availableOperations(machine, gameState.progression);
  const carried = gameState.player.inventory;
  const hasSwitch = machine.type.powerSwitch === true;
  const switchedOff = hasSwitch && !machine.isPowered;

  // The E chip shows exactly what the interact key resolved to — but
  // only when its subject is this machine (floor and door hints render
  // next to the player and the door instead). The rummage offset applies
  // only when this machine really is the keyboard's target, so the chip
  // steps aside the moment R cycles E onto the floor.
  const targeted = isTargeted(machine);
  const interact = resolveInteract(
    gameState,
    machine,
    targeted ? pileOffset : 0,
  );
  const interactHere =
    interact != null &&
    "machine" in interact &&
    isSameMachine(interact.machine.state, machine.state)
      ? interact
      : null;

  // With more material in reach than this machine's stock — pieces on
  // the floor beside the bench — R steps E through the whole ring, and
  // the chip says so (unless R belongs to a rotate setting here).
  const rummageable =
    targeted &&
    (interactHere?.kind === "take-inputs" ||
      interactHere?.kind === "take-outputs") &&
    materialSources(gameState, machine).length > 1 &&
    liveSettingParameter(machine, gameState.progression, "rotate") == null;

  // The F chip: what the machine would take out of our hands if we set it
  // down — named, the way the E chip names what it lifts back off. A
  // switched-off machine takes nothing; E offers the switch first.
  const stageable =
    isOperating || switchedOff
      ? []
      : stageableMaterials(machine, carried, gameState.progression);

  const settings = machineSettings(machine, operations);

  // The Space chip: whether there's something on the machine to run — the
  // shop's supplies and its clamp rack included. A tool in hand owns the
  // Space hold, so the chip stands down rather than lie.
  const canOperate =
    !isOperating &&
    !switchedOff &&
    heldTool(gameState) === null &&
    machineCanOperate(machine, shopSupply(gameState), gameState.progression);

  // The chip names the very work Space would do, resolved the same way
  // the action resolves it: the stock on a direct-feed machine picks its
  // operation, a bench runs its selected plan.
  const runOperation = !canOperate
    ? null
    : machine.type.directFeed
      ? (findFeedableOperation(machine, operations, machine.inputMaterials)
          ?.operation ?? null)
      : machine.selectedOperationOrNull;

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
      ? explainFeedRefusal(machine, operations, adviseOn, shopSupply(gameState))
      : null;

  const liftable =
    gameState.player.carriedMachine == null &&
    canPickUpMachine(gameState, machine.state);

  // What the station says it's doing: its own word for the job when it has
  // one ("emptying" at the garbage can), the generic motor otherwise.
  const workingWord =
    machine.selectedOperationOrNull?.runningName?.toLowerCase() ?? "running";

  const status = needsYou ? (
    <span className="text-store-orange">needs you</span>
  ) : isOperating ? (
    <span className="text-green-400">
      {switchedOff ? "paused · off" : workingWord}
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
      {rummageable && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="cycle-pile" />}
        >
          next piece
        </HintRow>
      )}
      {stageable.length > 0 && (
        <HintRow keys={<ShortcutKeys shortcut="put-down" />}>
          {machine.type.stageVerb ?? "place"} {getMaterialName(stageable[0])}
        </HintRow>
      )}
      {/* Hand work has no chip of its own: the bench view owns it
          (docs/bench-work.md), and the single "use workbench" chip
          below is the door to all of it — prying, plans, arranging. */}
      {canOperate && !runOperation?.interaction && (
        <HintRow keys={<ShortcutKeys shortcut="operate-machine" />}>
          hold to{" "}
          {(runOperation?.name ?? machine.type.feedVerb ?? "run").toLowerCase()}
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
              : "use workbench"}
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
 * direct-feed machine's settings can belong to any of its operations the
 * stock's orientation presents (a band saw set up to resaw offers the
 * resaw's fence, not the rip's); a bench only offers the selected plan's.
 * At most one is a "rotate" setting, so R never has to choose.
 */
function machineSettings(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
): ReadonlyArray<OperationParameter> {
  const source = machine.type.directFeed
    ? orientedOperations(machine, operations)
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
