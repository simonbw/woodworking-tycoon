import React, { useRef } from "react";
import { CellMap } from "../../game/CellMap";
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
  addWorkItemAction,
  clearWorkQueueAction,
} from "../../game/game-actions/work-item-actions";
import { vectorEquals } from "../../game/Vectors";
import { resolveInteract } from "../../game/interact";
import {
  machineCanOperate,
  parameterValueSatisfiable,
} from "../../game/machine-helpers";
import { materialMeetsInput } from "../../game/material-helpers";
import {
  defaultParametersFor,
  getOperationInputMaterials,
  isParameterizedOperation,
} from "../../game/operation-helpers";
import { availableOperations } from "../../game/skill-helpers";
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

  // Movement is deliberately absent here: walking is continuous (held
  // keys, not presses) and lives in HeldMovementListener + PlayerMotionLayer.

  useShortcut(
    "sweep",
    () => {
      if (gameState.current.progression.sweepingUnlocked) {
        applyAction(addWorkItemAction({ type: "sweep" }));
      }
    },
    present && !carrying,
  );

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
      const crateUnderfoot = gs.machineCrates.some((crate) =>
        vectorEquals(crate.position, gs.player.position),
      );
      if (crateUnderfoot) {
        return applyAction(pickUpCrateAction());
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
  useShortcut("clear-work-queue", () => applyAction(clearWorkQueueAction()));

  useShortcut("cycle-machine", cycleTarget, present);

  // Enter spreads out (or folds up) the targeted station's sheet — the
  // full paperwork behind the on-machine hints.
  useShortcut(
    "open-station-sheet",
    toggleSheet,
    present && !carrying && (sheetMachine != null || targetedMachine != null),
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
        case "pick-up-floor": {
          const cell = CellMap.fromGameState(gs).at(gs.player.position);
          if (!cell?.grabbablePiles.length) return;
          return applyAction(
            pickUpMaterialAction(
              event.shiftKey ? cell.grabbablePiles : [cell.grabbablePiles[0]],
            ),
          );
        }
        case "open-door":
          return openDoor();
      }
    },
    present && !carrying,
  );

  // Put down: give to the targeted machine if it takes what we're
  // holding — loading a bay, or feeding a direct-feed machine straight
  // from the hands — otherwise onto the floor.
  useShortcut(
    "put-down",
    (event) => {
      const gs = gameState.current;
      const inventory = gs.player.inventory;
      if (inventory.length === 0) return;

      const machine = targeted.current;
      // On a direct-feed machine "putting the stock in" is feeding it:
      // same physical act, so F and R agree. If the machine refuses the
      // stock (or is busy or off), the wood goes to the floor like
      // anywhere else.
      if (
        machine?.type.directFeed &&
        machine.operationProgress.status !== "inProgress" &&
        machineCanOperate(machine, gs.consumables, inventory, gs.progression)
      ) {
        return applyAction(operateMachineAction(machine));
      }
      if (machine && !machine.type.directFeed) {
        const spacesLeft =
          machine.type.inputSpaces - machine.inputMaterials.length;
        const inputMaterials = getOperationInputMaterials(
          machine.selectedOperation,
          machine.selectedParameters,
        );
        const matchingMaterials = inventory.filter((material) =>
          inputMaterials.some((input) => materialMeetsInput(material, input)),
        );

        if (spacesLeft > 0 && matchingMaterials.length > 0) {
          return applyAction(
            moveMaterialsToMachineAction(
              matchingMaterials.slice(0, event.shiftKey ? spacesLeft : 1),
              machine,
            ),
          );
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
      const machine = targeted.current;
      if (machine) applyAction(operateMachineAction(machine));
    },
    present && !carrying,
  );

  useShortcut(
    "power-toggle",
    () => {
      const machine = targeted.current;
      if (machine?.type.powerSwitch) {
        applyAction(toggleMachinePowerAction(machine));
      }
    },
    present,
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
    present,
  );

  // Cycle the machine's first setting — the keyboard equivalent of the
  // scales on the machine card. On direct-feed machines the first setting
  // of any available operation counts (the fence, the angle, the crank);
  // elsewhere it's the selected operation's first parameter.
  useShortcut(
    "cycle-parameter",
    (event) => {
      const machine = targeted.current;
      if (!machine) return;

      const directFeed = machine.type.directFeed === true;
      const operation = directFeed
        ? availableOperations(machine, gameState.current.progression).find(
            (op) => isParameterizedOperation(op) && op.parameters.length > 0,
          )
        : machine.selectedOperationOrNull;
      if (!operation || !isParameterizedOperation(operation)) return;

      const param = operation.parameters[0];
      if (!param || param.values.length < 2) return;

      // Unset (or unrecognised) lands at -1, so a forward cycle starts at the
      // first value.
      const current = machine.selectedParameters?.[param.id];
      const currentIndex =
        current === undefined ? -1 : param.values.indexOf(current);
      const step = event.shiftKey ? -1 : 1;
      let next = param.values[mod(currentIndex + step, param.values.length)];

      // A slide param moves the carried stock itself, so the key steps
      // between the marks the stock can actually reach — a 4' board slides
      // among its own foot marks, not the whole table's.
      if (param.presentation === "slide") {
        const carried = gameState.current.player.inventory;
        let nextIndex = param.values.indexOf(next);
        for (
          let tries = 0;
          tries < param.values.length &&
          !parameterValueSatisfiable(
            machine,
            operation,
            param.id,
            param.values[nextIndex],
            carried,
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
    },
    present,
  );

  return null;
};
