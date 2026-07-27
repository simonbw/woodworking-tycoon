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
 * The store's sign: the name stencilled across an orange square, set on
 * the 45° diagonal the way every big-box chain paints itself. "The" runs
 * small above the two big lines, and the long line is scaled to run the
 * full diagonal, corner to corner, so its ends just catch the square's
 * edges — a sign cut a size too big for its board is the whole look.
 * This is the one place stencil type is allowed outside the title screen:
 * it's a logo, not UI (see docs/design-system.md).
 *
 * The rotated layer is deliberately bigger than the square it sits in
 * (`-inset-16`): centering only works while the type fits its container,
 * and at this size the wordmark is wider than the square itself.
 */
const OrangeBoxLogo: React.FC = () => (
  <span
    className="relative block w-20 aspect-square overflow-hidden bg-store-orange shadow-[0.15rem_0.15rem_0_rgba(0,0,0,0.2)]"
    role="img"
    aria-label="Orange Box"
  >
    <span
      className="absolute -inset-16 grid place-items-center -rotate-45 font-stencil font-bold uppercase text-white leading-[0.95] tracking-tighter"
      aria-hidden
    >
      {/* The long line is the sign's midline — it's what sits on the
          square's diagonal, with the other two hung off it. Centering all
          three as one block instead balances them around the gap under
          "Orange", which leaves its baseline on the diagonal. */}
      {/* top: nudged a few pixels down the perpendicular — dead center
          reads a touch high once the eye weighs the small "The" against
          the big "Box". It's inside the rotated frame, so down here is
          down-and-right on screen. */}
      <span className="relative top-[0.15rem] text-[1.7rem]">
        Orange
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 text-[0.8rem]">
          The
        </span>
        <span className="absolute top-full left-1/2 -translate-x-1/2 text-[1.55rem]">
          Box
        </span>
      </span>
    </span>
  </span>
);

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
          brand={<OrangeBoxLogo />}
          tagline="Tools · Lumber · Hardware"
          barClassName="bg-white text-ink-black"
          brandRowClassName="items-center"
          mutedClassName="text-store-orange-dark"
          homeButtonClassName="border-store-orange-dark text-store-orange-dark hover:bg-store-orange/15"
          onHeadHome={headHome}
        />
        <div className="bg-store-concrete text-ink-black px-6 py-4 grow min-h-0 overflow-auto">
          {/* The floor plan: the lumber racks stand along one wall, and
              everything else is shelved as square tiles in the aisles
              beside them. Sized so the whole store fits one screen —
              the scrollbar here is a fallback for short windows, not
              part of the shopping trip. */}
          <div className="flex h-full min-h-0 gap-6">
            <section className="shrink-0">
              <h2 className="aisle-heading">Lumber</h2>
              <BoardSelector store="orangeBox" />
            </section>
            {/* Two independent runs of shelving rather than a grid: a
                grid would hold every aisle in a row to the tallest one's
                height, and the tool wall is half again as tall as
                anything else. Stacked this way each aisle takes only the
                room its own tiles need. */}
            <div className="grow min-w-0 flex gap-6">
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                <StoreSheetGoodsSection />
                <StoreToolsSection />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                <StoreMachinesSection />
                <StoreSuppliesSection />
              </div>
            </div>
          </div>
        </div>
      </div>
    </TripOverlay>
  );
};
