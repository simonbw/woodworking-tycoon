import React, { useRef } from "react";
import {
  defaultParametersFor,
  getMachines,
  isSameMachine,
  OperationParameter,
  operationParameters,
} from "../../game/Machine";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
  operateMachineAction,
  pickUpMaterialAction,
  setMachineOperationAction,
  setMachineSettingsAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
  toggleMachinePowerAction,
} from "../../game/game-actions/player-actions";
import {
  canPickUpMachine,
  pickUpCrateAction,
  pickUpMachineAction,
  putDownCarriedMachineAction,
  rotateCarriedMachineAction,
} from "../../game/game-actions/machine-actions";
import { toggleCarryShopVacAction } from "../../game/game-actions/shop-vac-actions";
import {
  pickUpBroomAction,
  putDownBroomAction,
} from "../../game/game-actions/dust-actions";
import { heldTool, holdingBroom } from "../../game/HeldTool";
import { atTruckBed } from "../../game/lot";
import {
  loadTruckBedAction,
  takeCrateFromTruckAction,
  takeFromTruckBedAction,
} from "../../game/game-actions/truck-actions";
import { chebyshevDistance } from "../../game/Vectors";
import { resolveInteract } from "../../game/interact";
import {
  findFeedableOperation,
  parameterValueSatisfiable,
  slideStock,
  stageableMaterials,
} from "../../game/machine-helpers";

import { availableOperations } from "../../game/skill-helpers";
import { hasStationSheet } from "../station/station-helpers";
import { mod } from "../../utils/mathUtils";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useApplyGameAction, useGameState } from "../useGameState";

export const ShopKeyboardShortcuts: React.FC = () => {
  const applyAction = useApplyGameAction();
  const _gameState = useGameState();
  const gameState = useRef(_gameState);
  gameState.current = _gameState;

  const {
    machine: targetedMachine,
    cycleTarget,
    sheetMachine,
    toggleSheet,
    closeSheet,
    doorOpen,
    openDoor,
    closeDoor,
  } = useTargetedMachine();
  const targeted = useRef(targetedMachine);
  targeted.current = targetedMachine;
  const doorOpenRef = useRef(doorOpen);
  doorOpenRef.current = doorOpen;

  // While the player is off scavenging they aren't in the shop, and the machine
  // panels are hidden — the keys shouldn't still reach into them.
  const present = !_gameState.player.away;
  // A machine over the shoulders means the hands are full: material and
  // machine verbs step aside until it's set down.
  const carrying = _gameState.player.carriedMachine != null;
  // A running station resolves its output against the plan and settings it
  // finds when it finishes, so the keys that would move either stand down
  // until the work is off the machine.
  const stationWorking =
    targetedMachine?.operationProgress.status === "inProgress";

  // Movement is deliberately absent here: walking is continuous (held
  // keys, not presses) and lives in HeldMovementListener + PlayerMotionLayer.

  useShortcut(
    "vac-toggle",
    () => applyAction(toggleCarryShopVacAction()),
    present && !carrying,
  );

  // Carry a machine: put down what's carried, else unpack the crate
  // underfoot, else hoist the machine the player is standing at (the
  // targeted one, so X picks between a table and what's mounted on it).
  useShortcut(
    "carry-machine",
    () => {
      const gs = gameState.current;
      if (!gs.progression.shopLayoutUnlocked) return;
      if (gs.player.carriedMachine) {
        return applyAction(putDownCarriedMachineAction());
      }
      const crateUnderfoot = gs.machineCrates.some(
        (crate) => chebyshevDistance(crate.position, gs.player.position) <= 1,
      );
      if (crateUnderfoot) {
        return applyAction(pickUpCrateAction());
      }
      if (
        gs.truck.crates.length > 0 &&
        atTruckBed(gs.shopInfo, gs.player.position)
      ) {
        return applyAction(takeCrateFromTruckAction());
      }
      const machine = targeted.current;
      if (machine && canPickUpMachine(gs, machine.state)) {
        applyAction(pickUpMachineAction(machine.state));
      }
    },
    present,
  );

  useShortcut(
    "carry-rotate",
    () => applyAction(rotateCarriedMachineAction()),
    present && carrying,
  );

  // An open station sheet (or door card) claims Escape — the binding
  // steps aside otherwise; emptying the queue stays available while
  // away — it only affects what happens once the player is back.
  useShortcut(
    "close-sheet",
    () => {
      closeSheet();
      closeDoor();
    },
    sheetMachine != null || doorOpen,
  );

  useShortcut("cycle-machine", cycleTarget, present);

  // Enter spreads out (or folds up) the targeted station's sheet — the
  // full paperwork behind the on-machine hints.
  useShortcut(
    "open-station-sheet",
    toggleSheet,
    present &&
      !carrying &&
      (sheetMachine != null ||
        (targetedMachine != null && hasStationSheet(targetedMachine))),
  );

  // E is the interact key: take finished work, unload a bay, switch the
  // machine on, pick up the floor, head out the door — whichever the
  // shared resolver says applies here. The hint chip next to the player
  // shows the same answer, so the key never surprises.
  useShortcut(
    "pick-up",
    (event) => {
      const gs = gameState.current;
      if (doorOpenRef.current) {
        return closeDoor();
      }
      const action = resolveInteract(gs, targeted.current);
      if (!action) return;
      switch (action.kind) {
        case "take-outputs":
          return applyAction(
            takeOutputsFromMachineAction(
              event.shiftKey
                ? action.machine.outputMaterials
                : [action.machine.outputMaterials[0]],
              action.machine,
            ),
          );
        case "take-inputs":
          return applyAction(
            takeInputsFromMachineAction(
              event.shiftKey
                ? action.machine.inputMaterials
                : [action.machine.inputMaterials[0]],
              action.machine,
            ),
          );
        case "switch-on":
        case "switch-off":
          return applyAction(toggleMachinePowerAction(action.machine));
        case "pick-up-floor":
          return applyAction(
            pickUpMaterialAction(
              event.shiftKey ? action.piles : [action.piles[0]],
            ),
          );
        case "pick-up-broom":
          return applyAction(pickUpBroomAction());
        case "truck-bed": {
          const bed = gs.truck.bed;
          return applyAction(
            takeFromTruckBedAction(
              event.shiftKey ? bed : [bed[bed.length - 1]],
            ),
          );
        }
        case "open-door":
          return openDoor();
      }
    },
    present && !carrying,
  );

  // Put down: hand it to the targeted machine if it takes what we're
  // holding — onto a bench's bay, onto a saw's table — otherwise onto the
  // floor. Setting stock down is all this does; the trigger is Space.
  useShortcut(
    "put-down",
    (event) => {
      const gs = gameState.current;
      const inventory = gs.player.inventory;
      if (inventory.length === 0) {
        // Empty-handed except for the broom: F leans it right here
        if (holdingBroom(gs)) applyAction(putDownBroomAction());
        return;
      }

      // At the truck's bed, F loads over the rail instead of dropping
      if (atTruckBed(gs.shopInfo, gs.player.position)) {
        return applyAction(
          loadTruckBedAction(event.shiftKey ? inventory : [inventory[0]]),
        );
      }

      const machine = targeted.current;
      if (machine && machine.operationProgress.status !== "inProgress") {
        const stageable = stageableMaterials(machine, inventory, gs.progression);
        if (stageable.length > 0) {
          const staged = event.shiftKey ? stageable : [stageable[0]];
          applyAction(moveMaterialsToMachineAction(staged, machine));
          // A power-feed machine has no separate trigger: the rollers grab
          // the board the moment it touches them, so setting it down *is*
          // starting it. (Read from the post-stage state, since the
          // operation is inferred from what's now on the machine.)
          if (machine.type.directFeed) {
            applyAction((state) => {
              const restaged = getMachines(state.machines).find((m) =>
                isSameMachine(m.state, machine.state),
              );
              if (!restaged) return state;
              const match = findFeedableOperation(
                restaged,
                availableOperations(restaged, state.progression),
                restaged.inputMaterials,
              );
              return match?.operation.powerFeed === true
                ? operateMachineAction(restaged)(state)
                : state;
            });
          }
          return;
        }
      }

      return applyAction(
        dropMaterialAction(event.shiftKey ? inventory : [inventory[0]]),
      );
    },
    present && !carrying,
  );

  useShortcut(
    "operate-machine",
    () => {
      // A tool in hand owns the hold: sweeping runs off the held flag in
      // tickAction, so the press mustn't also start the machine underfoot.
      if (heldTool(gameState.current) !== null) return;
      const machine = targeted.current;
      if (machine) applyAction(operateMachineAction(machine));
    },
    present && !carrying,
  );

  useShortcut(
    "cycle-operation",
    (event) => {
      const machine = targeted.current;
      if (!machine) return;

      // Direct-feed machines have no mode to cycle — the stock in hand
      // decides what a feed does.
      if (machine.type.directFeed) return;

      // Cycle only what the spec sheet offers — skill-locked recipes are
      // hidden there and shouldn't be reachable from the keyboard either.
      const operations = availableOperations(
        machine,
        gameState.current.progression,
      );
      if (operations.length === 0) return;

      // An unset (or no-longer-available) selection cycles in from either
      // end of the list rather than crashing or skipping an entry.
      const operationIndex = machine.selectedOperationOrNull
        ? operations.indexOf(machine.selectedOperationOrNull)
        : -1;
      const nextOperation =
        operationIndex === -1
          ? operations[event.shiftKey ? operations.length - 1 : 0]
          : operations[
              mod(operationIndex + (event.shiftKey ? -1 : 1), operations.length)
            ];

      applyAction(
        setMachineOperationAction(
          machine,
          nextOperation,
          defaultParametersFor(nextOperation),
        ),
      );
    },
    present && !stationWorking,
  );

  // Step one of the machine's settings — the keyboard equivalent of the
  // scales on its card. `kind` picks which: "linear" is the one Z and X
  // drive (the fence, the cutter head, the cut line), "rotate" is the one
  // R swings (the miter head). A machine carries at most one of each, so
  // neither key ever has to disambiguate.
  //
  // On direct-feed machines the setting can belong to any available
  // operation (what's in hand decides which one runs); on benches only the
  // selected operation's settings are live.
  const stepSetting = (kind: "linear" | "rotate", step: 1 | -1) => {
    const machine = targeted.current;
    if (!machine) return;

    const isKind = (param: OperationParameter) =>
      kind === "rotate"
        ? param.presentation === "rotate"
        : param.presentation !== "rotate";

    const directFeed = machine.type.directFeed === true;
    const candidates = directFeed
      ? availableOperations(machine, gameState.current.progression)
      : [machine.selectedOperationOrNull].filter((op) => op != null);
    const found = candidates
      .flatMap((op) =>
        operationParameters(op).map((param) => ({ op, param })),
      )
      .find(({ param }) => isKind(param) && param.values.length > 1);
    if (!found) return;
    const { op: operation, param } = found;

    // Unset (or unrecognised) lands at -1, so a forward step starts at the
    // first value.
    const current = machine.selectedParameters?.[param.id];
    const currentIndex =
      current === undefined ? -1 : param.values.indexOf(current);
    let next = param.values[mod(currentIndex + step, param.values.length)];

    // A slide param moves the stock itself, so the key steps between the
    // marks the stock can actually reach — a 4' board slides among its own
    // foot marks, not the whole table's.
    if (param.presentation === "slide") {
      const stock = slideStock(machine, [operation]);
      let nextIndex = param.values.indexOf(next);
      for (
        let tries = 0;
        tries < param.values.length &&
        !parameterValueSatisfiable(
          machine,
          operation,
          param.id,
          param.values[nextIndex],
          stock ? [stock] : [],
        );
        tries++
      ) {
        nextIndex = mod(nextIndex + step, param.values.length);
      }
      next = param.values[nextIndex];
    }

    if (directFeed) {
      // Settings turn without touching what's selected or running
      applyAction(setMachineSettingsAction(machine, { [param.id]: next }));
    } else {
      applyAction(
        setMachineOperationAction(machine, operation, {
          ...machine.selectedParameters,
          [param.id]: next,
        }),
      );
    }
  };

  useShortcut(
    "setting-down",
    () => stepSetting("linear", -1),
    present && !stationWorking,
  );
  useShortcut(
    "setting-up",
    () => stepSetting("linear", 1),
    present && !stationWorking,
  );
  // R swings the head; while a machine is carried the carry binding claims
  // the key instead and this one steps aside.
  useShortcut(
    "rotate-setting",
    (event) => stepSetting("rotate", event.shiftKey ? -1 : 1),
    present && !carrying && !stationWorking,
  );

  return null;
};
