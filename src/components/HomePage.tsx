import React from "react";
import { CommissionsSection } from "./CommissionsSection";
import { MaterialsSection } from "./MaterialsSection";
import { MoneySection } from "./MoneySection";
import { FloorListSection } from "./current-cell-info/FloorListSection";
import { InventorySection } from "./current-cell-info/InventorySection";
import { MachineListSection } from "./current-cell-info/MachineListSection";
import { ShopView } from "./shop-view/ShopView";

export const HomePage: React.FC = () => {
  return (
    <main className="p-8 space-y-6">
      <header className="flex gap-2 items-center">
        <img src="/images/favicon-3.png" className="relative w-16 top-1" />
        <h1 className="font-heading font-bold text-5xl tracking-wide">
          Woodworking Tycoon
        </h1>
      </header>

      <div className="flex gap-8 justify-center">
        <div className="space-y-6 w-full max-w-80">
          <MoneySection />
          <CommissionsSection />
        </div>
        <div className="space-y-1 flex flex-col items-center">
          <ShopView />
        </div>
        <div className="space-y-6 w-full max-w-96">
          <section>
            <h2 className="section-heading">Inventory</h2>
            <InventorySection />
          </section>
          <section>
            <h2 className="section-heading">Floor</h2>
            <FloorListSection />
          </section>
          <MachineListSection />
          <MaterialsSection />
        </div>
      </div>
    </main>
  );
};
