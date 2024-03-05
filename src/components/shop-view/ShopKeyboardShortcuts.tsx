import React, { useRef } from "react";
import { CellMap } from "../../game/CellMap";
import { combineActions } from "../../game/game-actions/misc-actions";
import {
  dropMaterialAction,
  instaMovePlayerAction,
  moveMaterialsToMachineAction,
  operateMachineAction,
  pickUpMaterialAction,
  setMachineOperationAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import { clearWorkQueueAction } from "../../game/game-actions/work-item-actions";
import { materialMeetsInput } from "../../game/material-helpers";
import { mod } from "../../utils/mathUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { useKeyDown } from "../useKeyDown";

export const ShopKeyboardShortcuts: React.FC = () => {
  const applyAction = useApplyGameAction();
  const _gameState = useGameState();
  const gameState = useRef(_gameState);
  gameState.current = _gameState;

  useKeyDown((event) => {
    switch (event.code) {
      case "Escape":
        return applyAction(clearWorkQueueAction());
      case "KeyD":
      case "ArrowRight":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(0))
        );
      case "KeyW":
      case "ArrowUp":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(1))
        );
      case "KeyA":
      case "ArrowLeft":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(2))
        );
      case "KeyS":
      case "ArrowDown":
        return applyAction(
          combineActions(clearWorkQueueAction(), instaMovePlayerAction(3))
        );

      // Pick Up
      case "KeyE": {
        const cellMap = CellMap.fromGameState(gameState.current);
        const cell = cellMap.at(gameState.current.player.position);

        for (const machine of cell?.operableMachines ?? []) {
          if (machine.outputMaterials.length) {
            return applyAction(
              takeOutputsFromMachineAction(
                event.shiftKey
                  ? machine.outputMaterials
                  : [machine.outputMaterials[0]],
                machine
              )
            );
          }
          if (machine.inputMaterials.length) {
            return applyAction(
              takeInputsFromMachineAction(
                event.shiftKey
                  ? machine.inputMaterials
                  : [machine.inputMaterials[0]],
                machine
              )
            );
          }
        }

        if (cell?.materialPiles.length) {
          return applyAction(
            pickUpMaterialAction(
              event.shiftKey ? cell.materialPiles : [cell.materialPiles[0]]
            )
          );
        }

        // nothing to pick up
        break;
      }

      // Put Down
      case "KeyF": {
        const inventory = gameState.current.player.inventory;
        const cellMap = CellMap.fromGameState(gameState.current);
        const cell = cellMap.at(gameState.current.player.position);

        if (inventory.length === 0) break;

        const machine = cell?.operableMachines[0];
        if (machine) {
          const spacesLeft =
            machine.type.inputSpaces - machine.inputMaterials.length;

          const matchingMaterials = inventory.filter((material) =>
            machine.selectedOperation.inputMaterials.some((input) =>
              materialMeetsInput(material, input)
            )
          );

          if (spacesLeft > 0 && matchingMaterials.length > 0) {
            return applyAction(
              moveMaterialsToMachineAction(
                matchingMaterials.slice(0, event.shiftKey ? spacesLeft : 1),
                machine
              )
            );
          }
        }

        // Otherwise just drop it
        return applyAction(
          dropMaterialAction(event.shiftKey ? inventory : [inventory[0]])
        );
      }

      // Operate Machine
      case "KeyR": {
        const cellMap = CellMap.fromGameState(gameState.current);
        const cell = cellMap.at(gameState.current.player.position);
        const machine = cell?.operableMachines[0];

        if (!machine) break;

        return applyAction(operateMachineAction(machine));
      }

      // Change Machine Operation
      case "KeyQ": {
        const cellMap = CellMap.fromGameState(gameState.current);
        const cell = cellMap.at(gameState.current.player.position);
        const machine = cell?.operableMachines[0];

        if (!machine) break;

        const operationIndex = machine.type.operations.indexOf(
          machine.selectedOperation
        );
        if (operationIndex === -1) {
          console.warn("Machine set to an operation it doesn't have");
          break;
        }
        const nextOperationIndex = mod(
          operationIndex + (event.shiftKey ? -1 : 1),
          machine.type.operations.length
        );
        return applyAction(
          setMachineOperationAction(
            machine,
            machine.type.operations[nextOperationIndex]
          )
        );
      }
    }
  });
  return null;
};
