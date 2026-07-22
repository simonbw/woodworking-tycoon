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

  const { machine: targetedMachine, cycleTarget } = useTargetedMachine();
  const targeted = useRef(targetedMachine);
  targeted.current = targetedMachine;

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

  // Emptying the queue stays available while away — it only affects what
  // happens once the player is back.
  useShortcut("clear-work-queue", () => applyAction(clearWorkQueueAction()));

  useShortcut("cycle-machine", cycleTarget, present);

  // Pick up: the targeted machine first, then any other machine on this square
  // that has something, then the floor. Checking the other machines matters —
  // otherwise standing at an empty bench next to a loaded saw would grab the
  // floor pile instead of the boards.
  useShortcut(
    "pick-up",
    (event) => {
      const cellMap = CellMap.fromGameState(gameState.current);
      const cell = cellMap.at(gameState.current.player.position);

      const candidates = [
        targeted.current,
        ...(cell?.operableMachines ?? []),
      ].filter((machine) => machine != null);

      // Outputs are collected where they land: at this cell for machines
      // whose outfeed points here, at the machine itself for single-point
      // stations (no outputPosition).
      const outputSources = [
        ...(cell?.outputMachines ?? []),
        ...candidates.filter(
          (machine) => machine.type.outputPosition === undefined,
        ),
      ];
      for (const machine of outputSources) {
        if (machine.outputMaterials.length) {
          return applyAction(
            takeOutputsFromMachineAction(
              event.shiftKey
                ? machine.outputMaterials
                : [machine.outputMaterials[0]],
              machine,
            ),
          );
        }
      }

      for (const machine of candidates) {
        if (machine.inputMaterials.length) {
          return applyAction(
            takeInputsFromMachineAction(
              event.shiftKey
                ? machine.inputMaterials
                : [machine.inputMaterials[0]],
              machine,
            ),
          );
        }
      }

      if (cell?.grabbablePiles.length) {
        return applyAction(
          pickUpMaterialAction(
            event.shiftKey ? cell.grabbablePiles : [cell.grabbablePiles[0]],
          ),
        );
      }
    },
    present && !carrying,
  );

  // Put down: into the targeted machine if it takes what we're holding,
  // otherwise onto the floor.
  useShortcut(
    "put-down",
    (event) => {
      const inventory = gameState.current.player.inventory;
      if (inventory.length === 0) return;

      const machine = targeted.current;
      // Direct-feed machines have no input bay to put things into — the
      // carried stock drops to the floor like anywhere else.
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
      const next =
        param.values[
          mod(currentIndex + (event.shiftKey ? -1 : 1), param.values.length)
        ];

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
