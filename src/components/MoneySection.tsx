import React from "react";
import { useGameState } from "./useGameState";

export const MoneySection: React.FC = () => {
  const gameState = useGameState();

  return (
    <section className="receipt-strip max-w-fit relative">
      {/* Receipt header — small uppercase label */}
      <div className="font-condensed uppercase tracking-[0.25em] text-xs text-ink-fade leading-none mb-1">
        Balance
      </div>
      <div className="font-mono text-3xl text-ink-black tabular-nums leading-none">
        ${gameState.money.toFixed(2)}
      </div>
    </section>
  );
};
