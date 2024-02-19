import React from "react";
import { CommissionsSection } from "./CommissionsSection";
import { MachinesSection } from "./MachinesSection";
import { MaterialsSection } from "./MaterialsSection";
import { MoneySection } from "./MoneySection";
import { ToolsSection } from "./ToolsSection";
import { ShopLayoutView } from "./ShopLayoutView";

export const GameView: React.FC = () => {
  return (
    <main className="p-12 space-y-6">
      <header className="flex gap-2 items-center">
        <img src="/images/favicon-3.png" className="relative w-16 top-1" />
        <h1 className="font-heading font-bold text-5xl tracking-wide">
          Woodworking Tycoon
        </h1>
      </header>

      <MoneySection />
      <MaterialsSection />
      <MachinesSection />
      <ToolsSection />
      <CommissionsSection />
      <ShopLayoutView />
    </main>
  );
};
