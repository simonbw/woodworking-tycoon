import { useRef } from "react";
import { Commission } from "../game/GameState";
import {
  InputMaterial,
  MachineOperation,
  MachineType,
} from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import { useGameState } from "./useGameState";

export function useGameHelpers() {
  const { gameState } = useGameState();
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const findMaterials = (
    inputMaterial: InputMaterial
  ): ReadonlyArray<MaterialInstance> => {
    return [];
  };

  const canCompleteCommission = (commission: Commission) => {
    return false;
  };

  const canPerformOperation = (operation: MachineOperation) => {
    return false;
  };

  const canBuyMachine = (machine: MachineType) => {
    return gameStateRef.current.money >= machine.cost;
  };

  return {
    findMaterials,
    canCompleteCommission,
    canPerformOperation,
    canBuyMachine,
  };
}
