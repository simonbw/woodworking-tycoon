import React from "react";
import { ActionBar } from "./ActionBar";
import { JobBoard } from "./JobBoard";
import { NavBar } from "./NavBar";
import { ShopManifest } from "./ShopManifest";
import { SuppliesSection } from "./SuppliesSection";
import { TargetedMachineProvider } from "./TargetedMachineContext";
import { Ticker } from "./Ticker";
import { MachinesSection } from "./current-cell-info/MachinesSection";
import { ShopView } from "./shop-view/ShopView";
import { useGameState } from "./useGameState";

export const HomePage: React.FC = () => {
  return (
    <TargetedMachineProvider>
      <HomePageContent />
    </TargetedMachineProvider>
  );
};

/** Day + balance chrome docked into the top bar next to the nav tabs. */
const TopBarStatus: React.FC = () => {
  const gameState = useGameState();
  return (
    <>
      <Ticker />
      <section className="flex items-baseline gap-2">
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-paper-manila/60">
          Balance
        </span>
        <div className="font-mono text-lg text-gold tabular-nums leading-none">
          ${gameState.money.toFixed(2)}
        </div>
      </section>
    </>
  );
};

/**
 * The home screen is a handful of physical objects anchored to the edges
 * of a viewport-sized page (see docs/design-system.md): day + balance in
 * the top bar, the job board on the left with the supply cabinet tally
 * pinned under it, the shop view up top center with the controls legend
 * on the bottom-center, and the manifest folder + contextual machine
 * spec sheet on the right. Panels appearing, disappearing, or growing
 * never shove their neighbors around; long content scrolls inside its
 * panel and the page itself never grows a scrollbar.
 */
const HomePageContent: React.FC = () => {
  return (
    <main className="h-screen flex flex-col gap-6 px-8 pt-8 pb-6 overflow-hidden">
      <NavBar aside={<TopBarStatus />} />

      <div className="flex gap-8 grow min-h-0">
        <div className="w-full max-w-80 flex flex-col gap-6 min-h-0">
          <div className="grow min-h-0 overflow-y-auto">
            <JobBoard />
          </div>
          <SuppliesSection />
        </div>
        <div className="grow flex flex-col items-center min-h-0 min-w-0 overflow-hidden">
          <ShopView />
          <div className="mt-auto pt-4 w-full max-w-md">
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
