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
 *
 * The screen is viewport-sized and each rail anchors its panels: the
 * manifest hangs from the top, the controls card sits on the bottom, and
 * the spec sheet pops into the gap between them — so panels appearing,
 * disappearing, or growing never shove their neighbors around, and long
 * content scrolls inside its panel instead of scrolling the page.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="h-screen flex flex-col gap-6 px-8 pt-8 pb-6 overflow-hidden">
      <NavBar />

      <div className="flex gap-8 grow min-h-0">
        <div className="w-full max-w-80 flex flex-col gap-6 min-h-0">
          <Ticker />
          <ShopLedger />
          <div className="grow min-h-0 overflow-y-auto">
            <JobBoard />
          </div>
        </div>
        <div className="grow flex items-start justify-center min-h-0 min-w-0 overflow-hidden">
          <ShopView />
        </div>
        <div className="w-full max-w-96 flex flex-col gap-6 min-h-0">
          <ShopManifest />
          <div className="grow min-h-0 overflow-y-auto">
            <MachinesSection />
          </div>
          <ActionBar />
        </div>
      </div>
    </main>
  );
};
