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
 * The home screen is the world itself: the canvas runs edge to edge with
 * the garage drawn as a building on its lot (see ShopView and
 * EnvironmentLayer), and everything else floats over it as a HUD.
 * Interaction hints live in the world, pinned to the thing they belong
 * to (see ShopOverlayLayer). The job board and the shop manifest — in
 * hand / underfoot / supplies — hang over the lot's left and right
 * edges; the chrome strip sits along the top under a scrim so it stays
 * readable over the grass. Panels appearing or growing never shove the
 * canvas around; long content scrolls inside its panel and the page
 * itself never grows a scrollbar.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        <ShopView />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-workshop-bg/90 via-workshop-bg/50 to-transparent px-6 pb-8 pt-6">
        <div className="pointer-events-auto">
          <NavBar />
        </div>
      </div>

      <div className="absolute bottom-6 left-6 top-24 z-20 w-80 overflow-y-auto">
        <DustTutorialCard />
        <JobBoard />
      </div>
      <div className="absolute bottom-6 right-6 top-24 z-20 flex w-80 flex-col">
        <ShopManifest />
      </div>
    </main>
  );
};
