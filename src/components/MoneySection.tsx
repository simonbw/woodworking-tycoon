import React from "react";
import { useGameState } from "./useGameState";
import { useGameActions } from "./useGameActions";

export const MoneySection: React.FC = () => {
  const { gameState } = useGameState();
  const { giveMoney } = useGameActions();

  return (
    <section className="p-6 bg-white/10 rounded-md max-w-fit flex flex-col gap-2 items-end">
      <p className="font-lumberjack text-4xl">${gameState.money.toFixed(2)}</p>

      <button className="button" onClick={() => giveMoney(1)}>
        Work Day Job
      </button>
    </section>
  );
};
