import React from "react";
import {
  interactLabel,
  materialSources,
  resolveInteract,
  takeBlockedReason,
} from "../../../game/interact";
import {
  hasFloorControls,
  isSameMachine,
  Machine,
  Operation,
  OperationParameter,
  operationParameters,
} from "../../../game/Machine";
import { isBenchtopOnFloor } from "../../../game/bench-mounting";
import {
  canPickUpMachine,
  shopCellMap,
} from "../../../sim/commands/machine-commands";
import { heldTool } from "../../../game/HeldTool";
import {
  explainFeedRefusal,
  findFeedableOperation,
  liveSettingParameter,
  machineCanOperate,
  orientedOperations,
  shopSupply,
  stageableMaterials,
} from "../../../game/machine-helpers";
import { getMaterialName } from "../../../game/material-helpers";
import { hasStationSheet } from "../../../components/station/station-helpers";
import { availableOperations } from "../../../game/skill-helpers";
import {
  HintList,
  HintRow,
  ReasonRow,
} from "../../../components/shortcuts/HintList";
import { ShortcutKeys } from "../../../components/shortcuts/Kbd";
import { computeMachineActivity } from "../../../views/machine-sprites/machine-activity";
import { useGame, useShopState } from "../../useShell";
import { useTargeting } from "../useTargeting";

/**
 * The hint cluster a targeted machine wears: the machine's name and
 * state on one line, then a key chip per verb that applies right now —
 * the same weight as the player's own "[F] put down" hint, nothing
 * card-like. Buttons, scales, and racks live on the station sheet
 * (Tab); the in-world sprite already shows settings physically (the
 * fence rides its rail, the miter head swings).
 *
 * The old component, over the shell hooks: `useMachineActivity` becomes
 * `computeMachineActivity` (the same recomputation the machine views
 * use — the audible-phase sync it layered on waits for the phase-8
 * sound port). Pure hints, exactly as before — the keys do the work.
 */
export const MachineChips: React.FC<{ machine: Machine }> = ({ machine }) => {
  const game = useGame();
  const gameState = useShopState();
  const { machines, isTargeted, pileOffset } = useTargeting();
  const { isOperating, needsYou } = computeMachineActivity(game, machine);

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
    shopCellMap(game),
    machine,
    targeted ? pileOffset : 0,
  );
  const interactHere =
    interact != null &&
    "machine" in interact &&
    isSameMachine(interact.machine.state, machine.state)
      ? interact
      : null;

  // Blocked hands (an armload, the broom) hide the take verbs from the
  // resolver entirely — so when this machine holds stock the chips would
  // otherwise offer, say why the offer is gone instead of going quiet.
  const takeBlocked = takeBlockedReason(gameState);
  const blockedTakeHere =
    takeBlocked != null &&
    interactHere == null &&
    materialSources(gameState, shopCellMap(game), machine, true).some(
      (source) =>
        source.kind !== "floor-pile" &&
        isSameMachine(source.machine.state, machine.state),
    );

  // With more material in reach than this machine's stock — pieces on
  // the floor beside the bench — R steps E through the whole ring, and
  // the chip says so (unless R belongs to a rotate setting here).
  const rummageable =
    targeted &&
    (interactHere?.kind === "take-inputs" ||
      interactHere?.kind === "take-outputs") &&
    materialSources(gameState, shopCellMap(game), machine).length > 1 &&
    liveSettingParameter(machine, gameState.progression, "rotate") == null;

  // The F chip: what the machine would take out of our hands if we set it
  // down — named, the way the E chip names what it lifts back off. A
  // switched-off machine takes nothing; E offers the switch first.
  const stageable =
    isOperating || switchedOff
      ? []
      : stageableMaterials(machine, carried, gameState.progression);

  // A bench is a table out here, not a machine: no plan, no scales, no
  // trigger. Everything about its work is behind Tab, over the bench top
  // (see Machine.hasFloorControls and docs/bench-work.md).
  const floorControls = hasFloorControls(machine.type);
  const settings = floorControls ? machineSettings(machine, operations) : [];

  // The Space chip: whether there's something on the machine to run — the
  // shop's supplies and its clamp rack included. A tool in hand owns the
  // Space hold, so the chip stands down rather than lie. A bench never
  // offers it: nothing about a bench's work is run from out here.
  const canOperate =
    floorControls &&
    !isOperating &&
    !switchedOff &&
    heldTool(gameState) === null &&
    machineCanOperate(machine, shopSupply(gameState), gameState.progression);

  // The chip names the very work Space would do, resolved the same way
  // the action resolves it: the stock on a direct-feed machine picks its
  // operation, a container runs the one job it has.
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

  // A benchtop machine sitting on the ground works, badly — say why the
  // cut is slow right where the player is standing to make it (see
  // bench-mounting.ts).
  const onFloor = isBenchtopOnFloor(machine, shopCellMap(game));

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
    <HintList testId="machine-chips">
      <HintRow className="text-paper-manila/60">
        {machine.type.name}
        {status && <> · {status}</>}
      </HintRow>
      {onFloor && (
        <HintRow className="max-w-56 whitespace-normal normal-case italic tracking-normal text-store-orange/90">
          On the floor: work here takes twice as long. Set it on a worktable.
        </HintRow>
      )}
      {interactHere && (
        <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
          {interactLabel(interactHere)}
        </HintRow>
      )}
      {blockedTakeHere && <ReasonRow>{takeBlocked}</ReasonRow>}
      {rummageable && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="cycle-pile" />}
        >
          next piece
        </HintRow>
      )}
      {/* Just the verb: what's in hand is already drawn in the hands
          strip, so naming it here would say it twice. With an armful the
          verb can't say *which* piece goes on, so that one names it. */}
      {stageable.length > 0 && (
        <HintRow keys={<ShortcutKeys shortcut="put-down" />}>
          {machine.type.stageVerb ?? "place"}
          {stageable.length > 1 && ` ${getMaterialName(stageable[0])}`}
        </HintRow>
      )}
      {/* Hand work has no chip of its own: the bench view owns it
          (docs/bench-work.md), and the single "[Tab] use" chip below is
          the door to all of it — prying, plans, arranging. `canOperate`
          is what keeps this off a bench, so the row can stay plain. */}
      {canOperate && (
        <HintRow keys={<ShortcutKeys shortcut="operate-machine" />} hold>
          {(runOperation?.name ?? machine.type.feedVerb ?? "run").toLowerCase()}
        </HintRow>
      )}
      {refusal && <ReasonRow>{refusal}</ReasonRow>}
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
            ? "accessories"
            : machine.type.container
              ? "contents"
              : "use"}
        </HintRow>
      )}
      {machines.length > 1 && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="cycle-machine" />}
        >
          next machine · {machines.length}
        </HintRow>
      )}
      {/* "carry", not "pick up": E on the same cluster is already the
          pick-up key, and the title has said which machine this is. */}
      {liftable && (
        <HintRow
          className="text-paper-manila/70"
          keys={<ShortcutKeys shortcut="carry-machine" />}
        >
          carry
        </HintRow>
      )}
    </HintList>
  );
};

/**
 * The settings the keys drive on this machine, each listed once — only
 * ever a station that's worked from the floor at all. A direct-feed
 * machine's can belong to any of its operations the stock's orientation
 * presents (a band saw set up to resaw offers the resaw's fence, not the
 * rip's); a container has only the one job's. At most one is a "rotate"
 * setting, so R never has to choose.
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
 * offered while the player stands at its outfeed cell — or, with the
 * hands committed elsewhere, the reason the take is off, so the chip
 * never offers a key the resolver would ignore.
 */
export const OutfeedChips: React.FC<{ machine: Machine }> = ({ machine }) => {
  const gameState = useShopState();
  const takeBlocked = takeBlockedReason(gameState);
  return (
    <HintList>
      <HintRow className="text-paper-manila/60">
        {machine.type.name} · outfeed
      </HintRow>
      {takeBlocked ? (
        <ReasonRow>{takeBlocked}</ReasonRow>
      ) : (
        <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
          take ({machine.outputMaterials.length})
        </HintRow>
      )}
    </HintList>
  );
};
