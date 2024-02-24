import { useMemo } from "react";
import { Commission, MaterialPile } from "../game/GameState";
import { MachineOperation } from "../game/MachineType";
import { MaterialInstance } from "../game/Materials";
import { Direction, Vector, vectorEquals } from "../game/Vectors";
import { performOperationAction } from "../game/game-actions/player-actions";
import { applyWorkItemAction } from "../game/game-actions/work-item-actions";
import { useApplyGameAction } from "./useGameState";

export function useGameActions() {
  const updateGameState = useApplyGameAction();

  return useMemo(
    () => ({
      performOperation: (operation: MachineOperation) =>
        updateGameState(performOperationAction(operation)),

      completeCommission: (commission: Commission) =>
        updateGameState((gameState) => {
          return {
            ...gameState,
            money: gameState.money + commission.rewardMoney,
            reputation: gameState.reputation + commission.rewardReputation,
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
