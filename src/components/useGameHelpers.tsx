import { useRef } from "react";
import { Commission, Machine } from "../game/GameState";
import {
  InputMaterial,
  MachineOperation,
  MachineType,
} from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import { Vector, rotateVec, translateVec } from "../game/Vectors";
import { useGameState } from "./useGameState";

export function useGameHelpers() {
  const _gameState = useGameState();
  const gameStateRef = useRef(_gameState);
  gameStateRef.current = _gameState;

  const findMaterials = (
    inputMaterial: InputMaterial
  ): ReadonlyArray<MaterialInstance> => {
    // TODO: Implement findMaterials
    return [];
  };

  const canCompleteCommission = (commission: Commission) => {
    // TODO: Implement canCompleteCommission
    return false;
  };

  const canPerformOperation = (operation: MachineOperation) => {
    const availableMaterials = [...gameStateRef.current.player.inventory];

    for (const inputMaterial of operation.inputMaterials) {
      const index = availableMaterials.findIndex((material) =>
        materialMeetsInput(material, inputMaterial)
      );
      if (index === -1) {
        return false;
      }
      availableMaterials.splice(index, 1);
    }

    return true;
  };

  const canBuyMachine = (machine: MachineType) => {
    return gameStateRef.current.money >= machine.cost;
  };

  return {
    findMaterials,
    canCompleteCommission,
    canPerformOperation,
    canBuyMachine,
    getMachineCells,
  };
}

export function getMachineCells(
  machinePosition: Machine
): ReadonlyArray<Vector> {
  return machinePosition.type.cellsOccupied.map((cell) =>
    translateVec(
      rotateVec(cell, machinePosition.rotation),
      machinePosition.position
    )
  );
}

export function materialMeetsInput(
  material: MaterialInstance,
  inputMaterial: InputMaterial
) {
  for (const key of Object.keys(inputMaterial)) {
    // Make sure to skip quantity, because that's not a property of the material
    if (key === "quantity") {
      continue;
    } else if (!(key in material)) {
      return false;
    } else if (
      !(inputMaterial as Record<string, unknown[]>)[key].includes(
        (material as Record<string, unknown>)[key]
      )
    ) {
      return false;
    }
  }
  return true;
}
