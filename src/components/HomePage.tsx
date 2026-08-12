import React from "react";
import { websiteRequested } from "../utils/urlFlags";
import { useBenchDiveActive } from "./bench-view/benchSceneSlot";
import { DustTutorialCard } from "./DustTutorialCard";
import { NightfallCard } from "./NightfallCard";
import { HandsStrip } from "./HandsStrip";
import { NavBar } from "./NavBar";
import { useTruckStage } from "./shop-view/truckStageStore";
import { StoreView } from "./store-view/StoreView";
import { SuppliesSection } from "./SuppliesSection";
import { TargetedMachineProvider } from "./TargetedMachineContext";
import { TutorialCard } from "./tutorial/TutorialCard";
import { ShopView } from "./shop-view/ShopView";
import { useGameState } from "./useGameState";

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
 * panel folds up under the top bar on the right, and the coach's card
 * holds the top-left. Panels appearing or growing never shove the canvas
 * around;
 * long content scrolls inside its panel and the page itself never grows
 * a scrollbar.
 */
const HomePageContent: React.FC = () => {
  // Leaned over a bench, the corner chips fade: the bench scene draws
  // in the shop's canvas underneath them, and they'd be unreachable
  // behind the bench view's pointer surface anyway. The top bar stays —
  // it deliberately rides above the bench view — and so does the
  // coach's card, because the guided opening's bench steps are read
  // mid-dive: its column rises over the bench view and slides down its
  // corner to clear the station nameplate. The one-time notes beneath
  // it read the shop floor, so they fade with the rest.
  const benchDive = useBenchDiveActive();
  const chipClass = `transition-opacity duration-150 ${
    benchDive ? "opacity-0" : "opacity-100"
  }`;

  // A shopping trip swaps the canvas from the shop to the store — one
  // scene at a time, so the single walking body, camera, and renderer
  // are never contested. The swap waits for the truck's departure roll
  // to finish (the fade covers it), and swaps back the moment the trip
  // ends so the arrival roll plays on the shop. The lumberyard is still
  // a menu overlay, and `?website` keeps the old store overlay instead
  // (see urlFlags.ts and issue #200).
  const gameState = useGameState();
  const truckStage = useTruckStage();
  const atWalkableStore =
    gameState.player.away?.kind === "shopping" &&
    gameState.player.away.store === "orangeBox" &&
    truckStage === "away" &&
    !websiteRequested();

  return (
    <main className="relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        {atWalkableStore ? <StoreView /> : <ShopView />}
      </div>

      {/* pointer-events-none so the full-width strip doesn't eat clicks
          meant for what's underneath (the NavBar re-enables its buttons) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <NavBar />
      </div>

      <div
        className={`absolute left-6 w-80 space-y-3 transition-[top] duration-300 ${
          benchDive ? "top-16 z-[36]" : "top-6 z-20"
        }`}
      >
        <TutorialCard />
        <div inert={benchDive} className={`space-y-3 ${chipClass}`}>
          <DustTutorialCard />
          <NightfallCard />
        </div>
      </div>

      <div
        inert={benchDive}
        className={`pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6 ${chipClass}`}
      >
        <div className="pointer-events-auto">
          <HandsStrip />
        </div>
      </div>
      {/* Deliberately outside the bench-dive fade: salvage pried loose at
          a bench flies to this tally, so it stays up and clickable above
          the bench view (z-35). below-top-bar clears the top bar's chip. */}
      <div className="absolute right-6 below-top-bar z-40">
        <SuppliesSection />
      </div>
    </main>
  );
};
