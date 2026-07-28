import React from "react";
import { CommissionTracker } from "./CommissionTracker";
import { DustTutorialCard } from "./DustTutorialCard";
import { HandsStrip } from "./HandsStrip";
import { NavBar } from "./NavBar";
import { SuppliesSection } from "./SuppliesSection";
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
 * EnvironmentLayer), and everything else floats over it as HUD chrome
 * (`hud-chip`). Interaction hints live in the world, pinned to the thing
 * they belong to (see ShopOverlayLayer). The name and readouts sit along
 * the top, what's in hand rides bottom-center (HandsStrip), the supply
 * tally keeps the bottom-right corner, and the current work order's
 * tracker chip holds the top-left — the always-on corner of the
 * clipboard that C (or a click) holds up in full. Panels appearing or
 * growing never shove the canvas around; long content scrolls inside
 * its panel and the page itself never grows a scrollbar.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        <ShopView />
      </div>

      <div className="absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <NavBar />
      </div>

      <div className="absolute left-6 top-6 z-20 w-80 space-y-3">
        <CommissionTracker />
        <DustTutorialCard />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
        <div className="pointer-events-auto">
          <HandsStrip />
        </div>
      </div>
      <div className="absolute bottom-6 right-6 z-20">
        <SuppliesSection />
      </div>
    </main>
  );
};
