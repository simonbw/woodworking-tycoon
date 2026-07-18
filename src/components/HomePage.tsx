import React from "react";
import { ActionBar } from "./ActionBar";
import { JobBoard } from "./JobBoard";
import { NavBar } from "./NavBar";
import { ShopManifest } from "./ShopManifest";
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
 * inside its panel and the page itself never grows a scrollbar. The
 * controls legend overlays the bottom of the center well so its row
 * count can't move the canvas.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="h-screen flex flex-col gap-6 p-6 overflow-hidden">
      <NavBar />

      <div className="flex gap-6 grow min-h-0">
        <div className="w-full max-w-96 min-h-0 overflow-y-auto">
          <JobBoard />
        </div>
        <div className="relative grow min-h-0 min-w-0 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <ShopView />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <div className="w-full max-w-md">
              <ActionBar />
            </div>
          </div>
        </div>
        <div className="w-full max-w-96 flex flex-col gap-6 min-h-0">
          <ShopManifest />
          <div className="mt-auto min-h-0 overflow-y-auto">
            <MachinesSection />
          </div>
        </div>
      </div>
    </main>
  );
};
