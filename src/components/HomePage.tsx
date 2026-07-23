import React from "react";
import { DustTutorialCard } from "./DustTutorialCard";
import { HandsStrip } from "./HandsStrip";
import { JobBoard } from "./JobBoard";
import { NavBar } from "./NavBar";
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
 * The home screen is the shop floor itself. The job board hangs on the
 * left wall; everything else — machine placards, the door's destination
 * list, outfeed stock, the station sheets — appears in the world, pinned
 * to the thing it belongs to (see ShopOverlayLayer). Below the canvas
 * sits the hands strip: what you're holding, what's underfoot, and the
 * supply cabinet. Panels appearing or growing never shove the canvas
 * around; long content scrolls inside its panel and the page itself
 * never grows a scrollbar.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="h-screen flex flex-col gap-6 p-6 overflow-hidden">
      <NavBar />

      <div className="flex gap-6 grow min-h-0">
        <div className="w-full max-w-96 min-h-0 overflow-y-auto">
          <DustTutorialCard />
          <JobBoard />
        </div>
        <div className="grow flex flex-col items-center gap-6 min-h-0 min-w-0">
          <ShopView />
          {/* min-h-0 lets the strip shrink into whatever the canvas
              leaves and scroll internally on short viewports */}
          <div className="w-full max-w-3xl min-h-0">
            <HandsStrip />
          </div>
        </div>
      </div>
    </main>
  );
};
