import React from "react";
import { NavBar } from "../NavBar";
import { useGameState } from "../useGameState";
import { JobBoardSection } from "./JobBoardSection";
import { ListingsSection } from "./ListingsSection";

/**
 * The Marketplace tab: the in-fiction equivalent of opening your laptop and
 * browsing the local classifieds — list items for sale, browse job offers.
 * Styled as a browser window sitting on the dark workshop bench.
 */
export const MarketplacePage: React.FC = () => {
  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="max-w-5xl rounded-md overflow-hidden shadow-2xl border border-workshop-edge">
        <BrowserChrome />
        <div className="bg-paper-ivory text-ink-black p-6">
          <SiteHeader />
          <div className="grid grid-cols-2 gap-6 mt-4">
            <ListingsSection />
            <JobBoardSection />
          </div>
        </div>
      </div>
    </main>
  );
};

/** Fake browser title bar — this is a website, not a machine in the shop. */
const BrowserChrome: React.FC = () => {
  return (
    <div className="bg-workshop-panel px-4 py-2 flex items-center gap-3">
      <div className="flex gap-1.5" aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-ink-red/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-gold/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-paper-manila/50" />
      </div>
      <div className="grow bg-workshop-bg rounded-sm px-3 py-1 font-mono text-xs text-paper-manila/70">
        www.sawdustlist.com
      </div>
    </div>
  );
};

const SiteHeader: React.FC = () => {
  const gameState = useGameState();
  return (
    <header className="flex items-baseline justify-between border-b-4 border-ink-blue pb-2">
      <div className="flex items-baseline gap-3">
        <span className="font-stencil text-3xl text-ink-blue leading-none">
          SawdustList
        </span>
        <span className="font-condensed uppercase tracking-[0.25em] text-xs text-ink-fade">
          Local Makers Marketplace
        </span>
      </div>
      <div className="flex items-baseline gap-4 font-mono text-sm tabular-nums">
        <span>
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
            Seller Rating
          </span>{" "}
          <span className="text-gold-dark">
            ★ {gameState.reputation.toFixed(1)}
          </span>
        </span>
        <span>
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
            Balance
          </span>{" "}
          ${gameState.money.toFixed(2)}
        </span>
      </div>
    </header>
  );
};
