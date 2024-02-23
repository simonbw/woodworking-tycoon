import { useMemo } from "react";
import { Commission, Machine, MaterialPile, Tool } from "../game/GameState";
import { MachineOperation } from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import {
  Direction,
  Vector,
  rotateVec,
  translateVec,
  vectorEquals,
} from "../game/Vectors";
import { materialMeetsInput, useGameHelpers } from "./useGameHelpers";
import { useGameState } from "./useGameState";
import { makeCellMap } from "./useCellMap";

export function useGameActions() {
  const { updateGameState } = useGameState();
  const helpers = useGameHelpers();

  return useMemo(
    () => ({
      giveMachine: (machinePlacement: Machine) =>
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

      giveMoney: (amount: number) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            money: gameState.money + amount,
          };
        }),

      performOperation: (operation: MachineOperation) =>
        updateGameState((gameState) => {
          console.log("Performing Operation", operation);

          const inventory = [...gameState.player.inventory];

          const materialsToConsume: MaterialInstance[] = [];

          for (const inputMaterial of operation.inputMaterials) {
            const index = inventory.findIndex((m) =>
              materialMeetsInput(m, inputMaterial)
            );
            if (index === -1) {
              console.warn(
                "Tried to perform operation without required materials"
              );
              return gameState;
            }
            materialsToConsume.push(inventory[index]);
            inventory.splice(index, 1);
          }

          const outputMaterials = operation.output(materialsToConsume);

          return {
            ...gameState,
            player: {
              ...gameState.player,
              inventory: [...inventory, ...outputMaterials],
            },
          };
        }),

      completeCommission: (commission: Commission) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            money: gameState.money + commission.rewardMoney,
            reputation: gameState.reputation + commission.rewardReputation,
          };
        }),

      movePlayer: (direction: Direction) =>
        updateGameState((gameState) => {
          const cellMap = makeCellMap(gameState);
          const moveVec = rotateVec([1, 0], direction);
          const [x, y] = translateVec(gameState.player.position, moveVec);
          const newCell = cellMap[y]?.[x];
          if (newCell === undefined || newCell.machine) {
            return gameState;
          }
          return {
            ...gameState,
            player: { ...gameState.player, position: [x, y] },
          };
        }),

      addMaterial: (material: MaterialInstance, position: Vector) =>
        updateGameState((gameState) => ({
          ...gameState,
          materialPiles: [...gameState.materialPiles, { material, position }],
        })),

      pickUpMaterial: (materialPile: MaterialPile) =>
        updateGameState((gameState) => {
          if (!vectorEquals(gameState.player.position, materialPile.position)) {
            console.warn("Tried to pick up material from wrong position");
          }
          return {
            ...gameState,
            player: {
              ...gameState.player,
              inventory: [...gameState.player.inventory, materialPile.material],
            },
            materialPiles: gameState.materialPiles.filter(
              (pile) => pile !== materialPile
            ),
          };
        }),

      dropMaterial: (material: MaterialInstance) =>
        updateGameState((gameState) => {
          if (!gameState.player.inventory.some((item) => item === material)) {
            console.warn("Tried to drop material not in inventory");
          }
          return {
            ...gameState,
            player: {
              ...gameState.player,
              inventory: gameState.player.inventory.filter(
                (item) => item !== material
              ),
            },
            materialPiles: [
              ...gameState.materialPiles,
              { material, position: gameState.player.position },
            ],
          };
        }),
    }),

    [updateGameState]
  );
}
