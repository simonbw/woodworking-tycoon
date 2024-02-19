import { useMemo } from "react";
import {
  Commission,
  Machine,
  MachinePlacement,
  Material,
  Operation,
  Tool,
} from "../game/GameState";
import { useGameState } from "./useGameState";
import { useGameHelpers } from "./useGameHelpers";

export function useGameActions() {
  const { updateGameState } = useGameState();
  const helpers = useGameHelpers();

  return useMemo(
    () => ({
      giveMachine: (machinePlacement: MachinePlacement) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            machines: [...gameState.machines, machinePlacement],
          };
        }),

      giveTool: (tool: Tool) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            tools: [...gameState.tools, tool],
          };
        }),

      giveMaterial: (material: Material) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            materials: [...gameState.materials, material],
          };
        }),

      takeMaterial: (material: Material) =>
        updateGameState((gameState) => {
          const materials = [...gameState.materials];
          const index = materials.indexOf(material);
          if (index !== -1) {
            materials.splice(index, 1);
          } else {
            throw new Error(`Material ${material.name} not found`);
          }
          return {
            ...gameState,
            materials,
          };
        }),

      giveMoney: (amount: number) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            money: gameState.money + amount,
          };
        }),

      doOperation: (operation: Operation) =>
        updateGameState((gameState) => {
          console.log("Doing operation", operation);
          const materials = [...gameState.materials];
          // TODO: This is really inefficient, we can do it all with only one copy
          for (const inputMaterial of operation.recipe.inputMaterials) {
            const index = materials.indexOf(inputMaterial);
            if (index !== -1) {
              materials.splice(index, 1);
            } else {
              throw new Error(
                `Material ${inputMaterial.name} not found for operation`
              );
            }
          }
          materials.push(...operation.recipe.outputMaterials);
          return {
            ...gameState,
            materials,
          };
        }),

      completeCommission: (commission: Commission) =>
        updateGameState((gameState) => {
          const materials = [...gameState.materials];
          for (const requiredMaterial of commission.requiredMaterials) {
            const index = materials.indexOf(requiredMaterial);
            if (index !== -1) {
              materials.splice(index, 1);
            } else {
              throw new Error(
                `Material ${requiredMaterial.name} not found for commission`
              );
            }
          }
          return {
            ...gameState,
            materials,
            money: gameState.money + commission.reward,
          };
        }),
    }),

    [updateGameState]
  );
}
