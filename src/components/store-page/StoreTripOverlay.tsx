import React from "react";
import { returnFromStoreAction } from "../../game/game-actions/door-actions";
import { TripHeader } from "../trip/TripHeader";
import { TripOverlay } from "../trip/TripOverlay";
import { useApplyGameAction, useGameState } from "../useGameState";
import { BoardSelector } from "./BoardSelector";
import { StoreMachinesSection } from "./StoreMachinesSection";
import { StoreSheetGoodsSection } from "./StoreSheetGoodsSection";
import { StoreSuppliesSection } from "./StoreSuppliesSection";
import { StoreToolsSection } from "./StoreToolsSection";

/**
 * A trip to Orange Box, the big-box hardware store. Reached by walking out
 * the garage door (see DoorPrompt); shown while the player's away trip is
 * a shopping one to the big box (the lumberyard has its own overlay). The
 * shop keeps ticking back home — browsing the aisles is what the trip
 * costs — and Head Home is the only way back.
 */
export const StoreTripOverlay: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const headHome = () => applyAction(returnFromStoreAction());

  if (
    gameState.player.away?.kind !== "shopping" ||
    gameState.player.away.store !== "orangeBox"
  ) {
    return null;
  }

  return (
    <TripOverlay label="Orange Box" onHeadHome={headHome}>
      <div className="rounded-md overflow-hidden shadow-2xl border border-store-orange-dark grow min-h-0 flex flex-col">
        <TripHeader
          brand={
            <span className="font-condensed font-bold text-3xl uppercase tracking-[0.2em] leading-none">
              Orange Box
            </span>
          }
          tagline="Tools · Lumber · Hardware"
          barClassName="bg-store-orange text-white"
          brandRowClassName="items-center"
          mutedClassName="text-white/80"
          homeButtonClassName="border-white/80 hover:bg-white/15"
          onHeadHome={headHome}
        />
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
    </TripOverlay>
  );
};
