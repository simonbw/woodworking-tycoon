import { useRef } from "react";
import { Commission, Machine } from "../game/GameState";
import {
  InputMaterial,
  MachineOperation,
  MachineType,
} from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import { useGameState } from "./useGameState";
import { Vector, translateVec, rotateVec } from "../game/Vectors";
import { range } from "../utils/arrayUtils";

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
    // TODO: Implement canPerformOperation
    return false;
  };

  const canBuyMachine = (machine: MachineType) => {
    return gameStateRef.current.money >= machine.cost;
  };

  type CellInfo = {
    x: number;
    y: number;
    machine: Machine | undefined;
    operableMachines: Machine[];
  };
  function getCellMap(): CellInfo[][] {
    const [width, height] = gameStateRef.current.shopInfo.size;

    const cells: CellInfo[][] = range(0, height - 1).map((y) =>
      range(0, width - 1).map((x) => ({
        x,
        y,
        machine: undefined,
        operableMachines: [],
      }))
    );

    for (const machine of gameStateRef.current.machines) {
      const machineCells = getMachineCells(machine);
      for (const cell of machineCells) {
        const [x, y] = cell;
        cells[y][x].machine = machine;
      }
      const [ox, oy] = translateVec(
        rotateVec(machine.type.operationPosition, machine.rotation),
        machine.position
      );

      if (ox >= 0 && ox < width && oy >= 0 && oy < height) {
        cells[oy][ox].operableMachines.push(machine);
      }
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
