import React from "react";
import { giveMoneyAction } from "../game/game-actions/misc-actions";
import { useApplyGameAction, useGameState } from "./useGameState";

export const MoneySection: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  return (
    <section className="p-6 bg-white/10 rounded-md max-w-fit flex flex-col gap-2 items-end">
      <p className="font-lumberjack text-4xl">${gameState.money.toFixed(2)}</p>

      <button
        className="button"
        onClick={() => applyAction(giveMoneyAction(1))}
      >
        Work Day Job
      </button>
    </section>
  );
};
