import React from "react";
import { ActionBar } from "./ActionBar";
import { CommissionsSection } from "./CommissionsSection";
import { MoneySection } from "./MoneySection";
import { NavBar } from "./NavBar";
import { Ticker } from "./Ticker";
import { FloorListSection } from "./current-cell-info/FloorListSection";
import { InventorySection } from "./current-cell-info/InventorySection";
import { MachineListSection } from "./current-cell-info/MachineListSection";
import { ShopView } from "./shop-view/ShopView";

export const HomePage: React.FC = () => {
  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="flex gap-8">
        <div className="space-y-6 w-full max-w-80">
          <Ticker />
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
          <ActionBar />
        </div>
      </div>
    </main>
  );
};
