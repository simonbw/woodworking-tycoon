import React from "react";
import { ActionBar } from "./ActionBar";
import { JobBoard } from "./JobBoard";
import { NavBar } from "./NavBar";
import { ShopLedger } from "./ShopLedger";
import { ShopManifest } from "./ShopManifest";
import { TargetedMachineProvider } from "./TargetedMachineContext";
import { Ticker } from "./Ticker";
import { MachinesSection } from "./current-cell-info/MachinesSection";
import { ShopView } from "./shop-view/ShopView";

export const HomePage: React.FC = () => {
  return (
    <TargetedMachineProvider>
      <HomePageContent />
    </TargetedMachineProvider>
  );
};

/**
 * The home screen is a handful of physical objects, not a pile of cards:
 * calendar, ledger, and job board on the left; the manifest folder, the
 * contextual machine spec sheet, and the controls card on the right.
 * See docs/design-system.md.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="flex gap-8">
        <div className="space-y-6 w-full max-w-80">
          <Ticker />
          <ShopLedger />
          <JobBoard />
        </div>
        <div className="space-y-1 flex flex-col items-center">
          <ShopView />
        </div>
        <div className="space-y-6 w-full max-w-96">
          <ShopManifest />
          <MachinesSection />
          <ActionBar />
        </div>
      </div>
    </main>
  );
};
