import React from "react";
import { Commission } from "../game/GameState";
import { completeCommissionAction } from "../game/game-actions/store-actions";
import { useGameHelpers } from "./useGameHelpers";
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
  const { canCompleteCommission } = useGameHelpers();
  const applyAction = useApplyGameAction();
  const name = commission.requiredMaterials
    .map((material) => `${material.type} (x${material.quantity})`)
    .join(", ");
  return (
    <li className="flex gap-1 items-center">
      <span>{name}</span>
      <button
        disabled={!canCompleteCommission(commission)}
        className="button"
        onClick={() => applyAction(completeCommissionAction(commission))}
      >
        Complete (${commission.rewardMoney.toFixed(2)})
      </button>
    </li>
  );
};
