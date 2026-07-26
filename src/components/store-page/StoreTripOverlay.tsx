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
/**
 * The store's sign: the name stencilled across an orange square, the way
 * every big-box chain paints itself. Three short lines stacked tight so
 * the block fills its box, and a ™ tucked under the corner. This is the
 * one place stencil type is allowed outside the title screen — it's a
 * logo, not UI (see docs/design-system.md).
 */
const OrangeBoxLogo: React.FC = () => (
  <span className="flex items-end gap-0.5" role="img" aria-label="Orange Box">
    <span
      className="aspect-square flex flex-col justify-center bg-store-orange text-white font-stencil font-bold uppercase text-[1.05rem] leading-[1.05] tracking-tight px-2 shadow-[0.15rem_0.15rem_0_rgba(0,0,0,0.2)]"
      aria-hidden
    >
      <span>The</span>
      <span>Orange</span>
      <span>Box</span>
    </span>
    <span className="font-condensed text-[0.55rem] leading-none pb-1 text-store-orange-dark">
      ™
    </span>
  </span>
);

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
          brand={<OrangeBoxLogo />}
          tagline="Tools · Lumber · Hardware"
          barClassName="bg-white text-ink-black"
          brandRowClassName="items-center"
          mutedClassName="text-store-orange-dark"
          homeButtonClassName="border-store-orange-dark text-store-orange-dark hover:bg-store-orange/15"
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
