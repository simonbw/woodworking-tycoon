import React from "react";
import { returnFromStoreAction } from "../../game/game-actions/door-actions";
import { useModalScope, useShortcut } from "../shortcuts/ShortcutProvider";
import { useApplyGameAction, useGameState } from "../useGameState";
import { BoardSelector } from "./BoardSelector";
import { StoreMachinesSection } from "./StoreMachinesSection";
import { StoreSheetGoodsSection } from "./StoreSheetGoodsSection";
import { StoreSuppliesSection } from "./StoreSuppliesSection";
import { StoreToolsSection } from "./StoreToolsSection";

/**
 * A trip to Orange Box, the big-box hardware store. Reached by walking out
 * the garage door (see DoorSection); shown while the player's away trip is
 * a shopping one to the big box (the lumberyard has its own overlay). The
 * shop keeps ticking back home — browsing the aisles is what the trip
 * costs — and Head Home is the only way back.
 */
export const StoreTripOverlay: React.FC = () => {
  const gameState = useGameState();

  if (
    gameState.player.away?.kind !== "shopping" ||
    gameState.player.away.store !== "orangeBox"
  ) {
    return null;
  }
  return <StoreTrip />;
};

/** Split out so the modal-scope hooks only run while the trip is live. */
const StoreTrip: React.FC = () => {
  const applyAction = useApplyGameAction();
  const headHome = () => applyAction(returnFromStoreAction());

  useModalScope();
  useShortcut("close-modal", headHome);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-workshop-bg p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Orange Box"
    >
      <div className="rounded-md overflow-hidden shadow-2xl border border-store-orange-dark grow min-h-0 flex flex-col">
        <StoreBrandBar onHeadHome={headHome} />
        <div className="bg-store-concrete text-ink-black p-6 grow min-h-0">
          {/* Each aisle scrolls on its own; the page never does */}
          <div className="grid grid-cols-3 gap-4 h-full">
            <section className="space-y-4 min-h-0 overflow-y-auto">
              <section>
                <h2 className="aisle-heading">Lumber</h2>
                <BoardSelector store="orangeBox" />
              </section>
              <StoreSheetGoodsSection />
            </section>
            <div className="space-y-6 min-h-0 overflow-y-auto">
              <StoreToolsSection />
              <StoreMachinesSection />
            </div>
            <section className="space-y-4 min-h-0 overflow-y-auto">
              <StoreSuppliesSection />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

const StoreBrandBar: React.FC<{ onHeadHome: () => void }> = ({
  onHeadHome,
}) => {
  const gameState = useGameState();
  return (
    <div className="bg-store-orange text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="font-condensed font-bold text-3xl uppercase tracking-[0.2em] leading-none">
          Orange Box
        </span>
        <span className="font-condensed uppercase tracking-[0.3em] text-xs text-white/80">
          Tools · Lumber · Hardware
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end font-mono leading-tight">
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-white/80">
            Your Wallet
          </span>
          <span className="text-xl tabular-nums">
            ${gameState.money.toFixed(2)}
          </span>
        </div>
        <button
          className="border-2 border-white/80 rounded-sm px-3 py-1.5 font-condensed font-bold uppercase tracking-[0.2em] text-sm hover:bg-white/15"
          onClick={onHeadHome}
          data-sfx="ui-back"
        >
          Head Home
        </button>
      </div>
    </div>
  );
};
