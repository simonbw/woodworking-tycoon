import React from "react";
import { ActionBar } from "./ActionBar";
import { JobBoard } from "./JobBoard";
import { NavBar } from "./NavBar";
import { ShopManifest } from "./ShopManifest";
import { SuppliesSection } from "./SuppliesSection";
import { TargetedMachineProvider } from "./TargetedMachineContext";
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
 * The home screen is a handful of physical objects anchored to the edges
 * of a viewport-sized page (see docs/design-system.md). One spacing unit
 * (gap-6) is used for the page margin, the column gutters, and the gaps
 * between panels, and the two side rails share a width, so the anchored
 * composition stays symmetric. Panels appearing, disappearing, or
 * growing never shove their neighbors around; long content scrolls
 * inside its panel and the page itself never grows a scrollbar.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="h-screen flex flex-col gap-6 p-6 overflow-hidden">
      <NavBar />

      <div className="flex gap-6 grow min-h-0">
        <div className="w-full max-w-96 flex flex-col gap-6 min-h-0">
          <div className="grow min-h-0 overflow-y-auto">
            <JobBoard />
          </div>
          <SuppliesSection />
        </div>
        <div className="grow flex flex-col gap-6 min-h-0 min-w-0 overflow-hidden">
          <div className="grow flex items-center justify-center min-h-0">
            <ShopView />
          </div>
          <div className="w-full max-w-md self-center shrink-0">
            <ActionBar />
          </div>
        </div>
        <div className="w-full max-w-96 flex flex-col gap-6 min-h-0">
          <ShopManifest />
          <div className="grow min-h-0 overflow-y-auto">
            <MachinesSection />
          </div>
        </div>
      </div>
    </main>
  );
};
