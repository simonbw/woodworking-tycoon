import { useRef } from "react";
import { Commission, Machine, Material, Operation } from "../game/GameState";
import { useGameState } from "./useGameState";

export function useGameHelpers() {
  const { gameState } = useGameState();
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const hasMaterials = (materials: readonly Material[]) => {
    // TODO: This is slow
    const availableMaterials = [...gameStateRef.current.materials];
    console.log("availableMaterials", availableMaterials);
    for (const material of materials) {
      const index = availableMaterials.indexOf(material);
      if (index === -1) {
        console.log("Missing material", material);
        return false;
      }
      availableMaterials.splice(index, 1);
    }
    return true;
  };

  const canCompleteCommission = (commission: Commission) => {
    return hasMaterials(commission.requiredMaterials);
  };

  const canPerformOperation = (operation: Operation) => {
    return hasMaterials(operation.recipe.inputMaterials);
  };

  const canBuyMachine = (machine: Machine) => {
    return gameStateRef.current.money >= machine.cost;
  };

  return {
    hasMaterials,
    canCompleteCommission,
    canPerformOperation,
    canBuyMachine,
  };
}
