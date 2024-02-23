import React from "react";
import { CommissionsSection } from "./CommissionsSection";
import { MaterialsSection } from "./MaterialsSection";
import { MoneySection } from "./MoneySection";
import { ShopView } from "./shop-view/ShopView";
import { ToolsSection } from "./ToolsSection";
import { DebugView } from "./DebugView";
import { CurrentCellInfo } from "./current-cell-info/CurrentCellInfo";
import { MiterSawSprite } from "./machine-sprites/MiterSawSprite";

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
          <ToolsSection />
        </div>
        <div className="space-y-1">
          <ShopView />
          <CurrentCellInfo />
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
