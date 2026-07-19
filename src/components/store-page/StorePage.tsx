import React from "react";
import { NavBar } from "../NavBar";
import { useGameState } from "../useGameState";
import { BoardSelector } from "./BoardSelector";
import { StoreMachinesSection } from "./StoreMachinesSection";
import { StoreSuppliesSection } from "./StoreSuppliesSection";
import { StoreToolsSection } from "./StoreToolsSection";

export const StorePage: React.FC = () => {
  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="rounded-md overflow-hidden shadow-2xl border border-store-orange-dark">
        <StoreBrandBar />
        <div className="bg-store-concrete text-ink-black p-6">
          <div className="grid grid-cols-3 gap-4">
            <section className="space-y-4">
              <BoardSelector />
              <StoreSuppliesSection />
            </section>
            <div className="space-y-6">
              <StoreToolsSection />
              <StoreMachinesSection />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

const StoreBrandBar: React.FC = () => {
  const gameState = useGameState();
  return (
    <div className="bg-store-orange text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="font-stencil text-3xl uppercase tracking-[0.2em] leading-none">
          Store
        </span>
        <span className="font-condensed uppercase tracking-[0.3em] text-xs text-white/80">
          Tools · Lumber · Hardware
        </span>
      </div>
      <div className="flex flex-col items-end font-mono leading-tight">
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-white/80">
          Your Wallet
        </span>
        <span className="text-xl tabular-nums">
          ${gameState.money.toFixed(2)}
        </span>
      </div>
    </div>
  );
};
