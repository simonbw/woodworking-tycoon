import React from "react";
import { Commission } from "../game/GameState";
import { useGameHelpers } from "./useGameHelpers";
import { useGameState } from "./useGameState";
import { useGameActions } from "./useGameActions";

export const CommissionsSection: React.FC = () => {
  const { gameState } = useGameState();
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
  const { completeCommission } = useGameActions();
  const name = commission.requiredMaterials
    .map((material) => `${material.type} (x${material.quantity})`)
    .join(", ");
  return (
    <li className="flex gap-1 items-center">
      <span>{name}</span>
      <button
        disabled={!canCompleteCommission(commission)}
        className="button"
        onClick={() => completeCommission(commission)}
      >
        Complete (${commission.rewardMoney.toFixed(2)})
      </button>
    </li>
  );
};
