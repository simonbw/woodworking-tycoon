import React from "react";
import { useShopOpen } from "../useShell";
import { HandsStrip } from "./HandsStrip";
import { ManualProvider } from "./manual/ManualProvider";
import { NavBar } from "./NavBar";
import { NightfallCard } from "./NightfallCard";
import { FloorSheet } from "./overlay/FloorSheet";
import { RewardFlightLayer } from "./payout/RewardFlightLayer";
import { StartMenu } from "./StartMenu";
import { StationSheet } from "./station/StationSheet";
import { BenchStatusLine } from "./bench/BenchStatusLine";
import { BenchToolRail } from "./bench/BenchToolRail";
import { useBenchDiveActive } from "./bench/useBenchDive";
import { StoreScreen } from "./store/StoreScreen";
import { LumberyardTripOverlay } from "./trips/LumberyardTripOverlay";
import { ScavengeTripOverlay } from "./trips/ScavengeTripOverlay";
import { SleepOverlay } from "./trips/SleepOverlay";
import { SuppliesSection } from "./SuppliesSection";
import { TutorialCards } from "./tutorial/TutorialCard";
import { TutorialSpotlightLayer } from "./tutorial/TutorialSpotlightLayer";

/**
 * The HUD chrome over the engine shell's canvas — the successor of
 * HomePage's overlay frame. The same layout contract holds: the canvas
 * runs edge to edge underneath, every strip here passes clicks through
 * (`pointer-events-none`) and only the chips re-enable them, and panels
 * never shove the canvas around.
 *
 * Before any shop is live this is the old Main's menu branch: the start
 * menu fills the sheet, and starting a game (its buttons boot the shop)
 * swaps it for the HUD.
 *
 * The wrappers are HomePage's: the NavBar along the top (clock,
 * balances, Skills, the manual's ?, Menu — with the journal, binder, and
 * pause menu behind them), the coach's column top-left, what's in hand
 * bottom-center, the supply panel folded under the top bar on the right.
 * The screen-anchored station and floor cards ride below the top bar's
 * z-40 so its buttons stay clickable over them; the world-pinned chips
 * and prompts live in OverlayRoot, not here.
 */
export const EngineHud: React.FC = () => {
  const open = useShopOpen();
  // Leaned over a bench, the corner chips fade: the bench view draws in
  // the canvas underneath them, and they'd be unreachable behind its
  // pointer surface anyway. The top bar stays — it deliberately rides
  // above the bench view — and so do the coach's cards, because the
  // guided opening's bench steps are read mid-dive: their column rises
  // over the bench view and slides down its corner to clear the tool
  // rail. The nightfall note beneath them reads the shop floor, so it
  // fades with the rest.
  const benchDive = useBenchDiveActive();
  const chipClass = `transition-opacity duration-150 ${
    benchDive ? "opacity-0" : "opacity-100"
  }`;
  if (!open) return <StartMenu />;

  return (
    // ManualProvider wraps the whole frame (old Main.tsx's nesting) so
    // `useManual` reaches every chip and card that points into the binder.
    <ManualProvider>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <NavBar />
      </div>

      {/* The coach's column: the tutorial cards at the top of the
          wrapper, the nightfall note beneath them */}
      <div
        className={`absolute left-6 w-80 space-y-3 transition-[top] duration-300 ${
          benchDive ? "top-16 z-[36]" : "top-6 z-20"
        }`}
      >
        <TutorialCards />
        <div inert={benchDive} className={`space-y-3 ${chipClass}`}>
          <NightfallCard />
        </div>
      </div>

      {/* The ring the guided opening draws around chrome; in-world
          things wear TutorialHighlightView's outline instead. */}
      <TutorialSpotlightLayer />

      {/* pointer-events-none so the full-width strip doesn't eat clicks
          meant for what's underneath (the chip re-enables its buttons) */}
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
          the bench view. below-top-bar clears the top bar's chip. */}
      <div className="absolute right-6 below-top-bar z-40">
        <SuppliesSection />
      </div>

      {/* The screen-anchored cards: whole-window surfaces, below the top
          bar's z-40 on purpose so its buttons stay clickable over them. */}
      <StationSheet />
      <FloorSheet />

      {/* The walkable store's chrome (cart corner + receipt card); its
          own null-gate keeps it off-screen at home. */}
      <StoreScreen />

      {/* Leaned over a bench: the tool rail is the mode selector above,
          the line naming the next move below. */}
      <BenchToolRail />
      <BenchStatusLine />

      {/* The away trips that cover the screen (each gates on its own
          `player.away` kind): the lumberyard's storefront, the
          scavenging circuit, and the night between days. The wrapper
          re-enables pointer events under HudRoot's inert sheet (the
          same seam the manual's modal crosses), without a box of its
          own. */}
      <div className="pointer-events-auto contents">
        <LumberyardTripOverlay />
        <ScavengeTripOverlay />
        <SleepOverlay />
      </div>

      {/* The sale celebration, above everything (z-60): coins and the
          star fly to the top bar's readouts. */}
      <RewardFlightLayer />
    </ManualProvider>
  );
};
