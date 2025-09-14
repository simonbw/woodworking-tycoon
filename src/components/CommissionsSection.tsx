import React from "react";
import { Commission } from "../game/GameState";
import { completeCommissionAction } from "../game/game-actions/store-actions";
import { materialMeetsInput } from "../game/material-helpers";
import { useApplyGameAction, useGameState } from "./useGameState";

export const CommissionsSection: React.FC = () => {
  const gameState = useGameState();
  return (
    <section className="space-y-2">
      <h2 className="section-heading">Commissions</h2>
      <ul>
        {gameState.commissions.map((commission, i) => (
          <CommissionListItem key={i} commission={commission} />
        ))}
      </ul>
    </section>
  );
};

const CommissionListItem: React.FC<{
  commission: Commission;
}> = ({ commission }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const name = commission.requiredMaterials
    .map((material) => `${material.type} (x${material.quantity})`)
    .join(", ");

  // Check if player has all required materials
  const canComplete = commission.requiredMaterials.every((requiredMaterial) => {
    const matchingMaterials = gameState.player.inventory.filter((material) =>
      materialMeetsInput(material, requiredMaterial),
    );
    return matchingMaterials.length >= requiredMaterial.quantity;
  });

  return (
    <li className="flex gap-1 items-center">
      <span>{name}</span>
      <button
        disabled={!canComplete}
        className="button"
        onClick={() => applyAction(completeCommissionAction(commission))}
      >
        Complete (${commission.rewardMoney.toFixed(2)})
      </button>
    </li>
  );
};
