import React from "react";
import { useBenchDiveActive } from "./bench-view/benchSceneSlot";
import { DustTutorialCard } from "./DustTutorialCard";
import { HandsStrip } from "./HandsStrip";
import { NavBar } from "./NavBar";
import { SuppliesSection } from "./SuppliesSection";
import { TargetedMachineProvider } from "./TargetedMachineContext";
import { TutorialCard } from "./tutorial/TutorialCard";
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
 * tally keeps the bottom-right corner, and the coach's card holds the
 * top-left. Panels appearing or growing never shove the canvas around;
 * long content scrolls inside its panel and the page itself never grows
 * a scrollbar.
 */
const HomePageContent: React.FC = () => {
  // Leaned over a bench, the corner chips fade: the bench scene draws
  // in the shop's canvas underneath them, and they were unreachable
  // behind the bench view's pointer surface anyway. The top bar stays —
  // it deliberately rides above the bench view.
  const benchDive = useBenchDiveActive();
  const chipClass = `transition-opacity duration-150 ${
    benchDive ? "opacity-0" : "opacity-100"
  }`;
  return (
    <main className="relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        <ShopView />
      </div>

      {/* pointer-events-none so the full-width strip doesn't eat clicks
          meant for what's underneath (the NavBar re-enables its buttons) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <NavBar />
      </div>

      <div
        inert={benchDive}
        className={`absolute left-6 top-6 z-20 w-80 space-y-3 ${chipClass}`}
      >
        <TutorialCard />
        <DustTutorialCard />
      </div>

      <div
        inert={benchDive}
        className={`pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6 ${chipClass}`}
      >
        <div className="pointer-events-auto">
          <HandsStrip />
        </div>
      </div>
      <div
        inert={benchDive}
        className={`absolute bottom-6 right-6 z-20 ${chipClass}`}
      >
        <SuppliesSection />
      </div>
    </main>
  );
};
