import { useMemo } from "react";
import { Commission, Machine, Tool } from "../game/GameState";
import { Direction, rotateVec, translateVec } from "../game/Vectors";
import { MachineOperation } from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import { useGameHelpers } from "./useGameHelpers";
import { useGameState } from "./useGameState";
import { clamp } from "../utils/mathUtils";

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

      giveMaterial: (material: MaterialInstance) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            materials: [...gameState.materials, material],
          };
        }),

      giveMoney: (amount: number) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            money: gameState.money + amount,
          };
        }),

      doOperation: (operation: MachineOperation) =>
        updateGameState((gameState) => {
          console.log("Doing operation", operation);
          return {
            ...gameState,
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
          const cellMap = helpers.getCellMap();
          const player = gameState.people[0];
          const moveVec = rotateVec([1, 0], direction);
          const [x, y] = translateVec(player.position, moveVec);
          const newCell = cellMap[y]?.[x];
          if (newCell === undefined || newCell.machine) {
            return gameState;
          }
          return {
            ...gameState,
            people: [{ ...player, position: [x, y] }],
          };
        }),
    }),

    [updateGameState]
  );
}
