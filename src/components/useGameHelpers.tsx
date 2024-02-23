import { useRef } from "react";
import { Commission, Machine, MaterialPile } from "../game/GameState";
import {
  InputMaterial,
  MachineOperation,
  MachineType,
} from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import { Vector, rotateVec, translateVec } from "../game/Vectors";
import { range } from "../utils/arrayUtils";
import { useGameState } from "./useGameState";

export function useGameHelpers() {
  const { gameState: _gameState } = useGameState();
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

  type CellInfo = {
    x: number;
    y: number;
    machine: Machine | undefined;
    operableMachines: Machine[];
    materialPiles: MaterialPile[];
  };
  function getCellMap(): CellInfo[][] {
    const [width, height] = gameStateRef.current.shopInfo.size;

    const cells: CellInfo[][] = range(0, height - 1).map((y) =>
      range(0, width - 1).map((x) => ({
        x,
        y,
        machine: undefined,
        operableMachines: [],
        materialPiles: [],
      }))
    );

    for (const machine of gameStateRef.current.machines) {
      const machineCells = getMachineCells(machine);
      for (const cell of machineCells) {
        const [x, y] = cell;
        cells[y][x].machine = machine;
      }

      if (machine.type.operationPosition !== undefined) {
        const [ox, oy] = translateVec(
          rotateVec(machine.type.operationPosition, machine.rotation),
          machine.position
        );

        if (ox >= 0 && ox < width && oy >= 0 && oy < height) {
          cells[oy][ox].operableMachines.push(machine);
        }
      }
    }

    for (const materialPile of gameStateRef.current.materialPiles) {
      const [x, y] = materialPile.position;
      cells[y][x].materialPiles.push(materialPile);
    }

    return cells;
  }

  return {
    findMaterials,
    canCompleteCommission,
    canPerformOperation,
    canBuyMachine,
    getCellMap,
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
