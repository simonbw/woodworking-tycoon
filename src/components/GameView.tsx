import React, { useState } from "react";
import { CommissionsSection } from "./CommissionsSection";
import { MachinesSection } from "./MachinesSection";
import { MaterialsSection } from "./MaterialsSection";
import { MoneySection } from "./MoneySection";
import { ShopView } from "./ShopView";
import { ToolsSection } from "./ToolsSection";
import { useGameState } from "./useGameState";

export const GameView: React.FC = () => {
  return (
    <main className="p-12 space-y-6">
      <header className="flex gap-2 items-center">
        <img src="/images/favicon-3.png" className="relative w-16 top-1" />
        <h1 className="font-heading font-bold text-5xl tracking-wide">
          Woodworking Tycoon
        </h1>
      </header>

      <div className="grid grid-cols-3">
        <div className="space-y-6">
          <MaterialsSection />
          <MachinesSection />
          <ToolsSection />
        </div>
        <div className="space-y-6">
          <ShopView />
        </div>
        <div className="space-y-6">
          <MoneySection />
          <CommissionsSection />
        </div>
      </div>
      <DebugView />
    </main>
  );
};

const DebugView: React.FC = () => {
  const { gameState } = useGameState();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="button">
        Debug
      </button>
    );
  } else {
    return (
      <pre
        className="whitespace-pre-wrap text-xs rounded p-2 bg-white/20 cursor-pointer"
        onClick={() => setOpen(false)}
      >
        {JSON.stringify(gameState, null, 2)}
      </pre>
    );
  }
};
