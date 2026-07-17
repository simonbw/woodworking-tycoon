import React, { useRef } from "react";
import { CellMap } from "../../game/CellMap";
import { ParameterValues } from "../../game/Machine";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
  operateMachineAction,
  pickUpMaterialAction,
  setMachineOperationAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import {
  addWorkItemAction,
  cancelLastWorkItemAction,
  clearWorkQueueAction,
} from "../../game/game-actions/work-item-actions";
import { materialMeetsInput } from "../../game/material-helpers";
import {
  getOperationInputMaterials,
  isParameterizedOperation,
} from "../../game/operation-helpers";
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

  useShortcut(
    "move-right",
    () => applyAction(addWorkItemAction({ type: "move", direction: 0 })),
    present,
  );
  useShortcut(
    "move-up",
    () => applyAction(addWorkItemAction({ type: "move", direction: 1 })),
    present,
  );
  useShortcut(
    "move-left",
    () => applyAction(addWorkItemAction({ type: "move", direction: 2 })),
    present,
  );
  useShortcut(
    "move-down",
    () => applyAction(addWorkItemAction({ type: "move", direction: 3 })),
    present,
  );

  // Emptying the queue stays available while away — it only affects what
  // happens once the player is back.
  useShortcut("clear-work-queue", () => applyAction(clearWorkQueueAction()));
  useShortcut("cancel-last-move", () => applyAction(cancelLastWorkItemAction()));

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

      for (const machine of candidates) {
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

      if (cell?.materialPiles.length) {
        return applyAction(
          pickUpMaterialAction(
            event.shiftKey ? cell.materialPiles : [cell.materialPiles[0]],
          ),
        );
      }
    },
    present,
  );

  // Put down: into the targeted machine if it takes what we're holding,
  // otherwise onto the floor.
  useShortcut(
    "put-down",
    (event) => {
      const inventory = gameState.current.player.inventory;
      if (inventory.length === 0) return;

      const machine = targeted.current;
      if (machine) {
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
    present,
  );

  useShortcut(
    "operate-machine",
    () => {
      const machine = targeted.current;
      if (machine) applyAction(operateMachineAction(machine));
    },
    present,
  );

  useShortcut(
    "cycle-operation",
    (event) => {
      const machine = targeted.current;
      if (!machine) return;

      const operationIndex = machine.operations.indexOf(
        machine.selectedOperation,
      );
      if (operationIndex === -1) {
        console.warn("Machine set to an operation it doesn't have");
        return;
      }
      const nextOperation =
        machine.operations[
          mod(
            operationIndex + (event.shiftKey ? -1 : 1),
            machine.operations.length,
          )
        ];

      let parameters: ParameterValues | undefined = undefined;
      if (isParameterizedOperation(nextOperation)) {
        parameters = {};
        for (const param of nextOperation.parameters) {
          parameters[param.id] = param.values[0];
        }
      }

      applyAction(setMachineOperationAction(machine, nextOperation, parameters));
    },
    present,
  );

  // Cycle the first parameter of the selected operation — the keyboard
  // equivalent of the parameter dropdowns on the machine card.
  useShortcut(
    "cycle-parameter",
    (event) => {
      const machine = targeted.current;
      if (!machine) return;

      const operation = machine.selectedOperation;
      if (!isParameterizedOperation(operation)) return;

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

      applyAction(
        setMachineOperationAction(machine, operation, {
          ...machine.selectedParameters,
          [param.id]: next,
        }),
      );
    },
    present,
  );

  return null;
};