import React from "react";
import { DustTutorialCard } from "./DustTutorialCard";
import { JobBoard } from "./JobBoard";
import { NavBar } from "./NavBar";
import { ShopManifest } from "./ShopManifest";
import { TargetedMachineProvider } from "./TargetedMachineContext";
import { ShopView } from "./shop-view/ShopView";

export const HomePage: React.FC = () => {
  return (
    <TargetedMachineProvider>
      <HomePageContent />
    </TargetedMachineProvider>
  );
};

/**
 * The home screen is the shop floor itself: the canvas scales to fill
 * everything between the rails (see ShopView), and interaction hints
 * live in the world, pinned to the thing they belong to (see
 * ShopOverlayLayer). The job board hangs on the left wall; the shop
 * manifest — in hand / underfoot / supplies — on the right. Panels
 * appearing or growing never shove the canvas around; long content
 * scrolls inside its panel and the page itself never grows a scrollbar.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="h-screen flex flex-col gap-6 p-6 overflow-hidden">
      <NavBar />

      <div className="flex gap-6 grow min-h-0">
        <div className="w-full max-w-80 min-h-0 overflow-y-auto shrink-0">
          <DustTutorialCard />
          <JobBoard />
        </div>
        <div className="grow min-h-0 min-w-0">
          <ShopView />
        </div>
        <div className="w-full max-w-80 min-h-0 shrink-0 flex flex-col">
          <ShopManifest />
        </div>
      </div>
    </main>
  );
};
