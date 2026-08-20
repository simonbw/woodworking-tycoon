import React from "react";
import { TripOverlay } from "../../../components/trip/TripOverlay";
import { useShopState } from "../../useShell";
import { BoardSelector } from "../trips/BoardSelector";
import { TripHeader } from "../trips/TripHeader";
import { useStoreTrip } from "../trips/useStoreTrip";
import { StoreCartReadout, StoreCheckoutButton } from "../store/StoreCart";
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
 * A trip to Orange Box, the big-box hardware store, as a full-screen
 * storefront. This is the future Orange Box website (issue #200): the
 * walkable aisles are what a shopping trip opens, and this overlay takes
 * the screen instead only under the `?website` flag (see urlFlags.ts and
 * the mount in EngineHud). The shop keeps ticking back home — browsing
 * the aisles is what the trip costs — and Head Home is the only way back.
 */
export const StoreTripOverlay: React.FC = () => {
  const gameState = useShopState();
  const {
    cart,
    total,
    overdrawn,
    canCheckOut,
    confirmingLeave,
    requestLeave,
    checkOutAndLeave,
  } = useStoreTrip();

  if (
    gameState.player.away?.kind !== "shopping" ||
    gameState.player.away.store !== "orangeBox"
  ) {
    return null;
  }

  return (
    <TripOverlay label="Orange Box" onHeadHome={requestLeave}>
      <div className="rounded-md overflow-hidden shadow-2xl border border-store-orange-dark grow min-h-0 flex flex-col">
        <TripHeader
          brand={<OrangeBoxLogo />}
          tagline="Tools · Lumber · Hardware"
          barClassName="bg-white text-ink-black"
          brandRowClassName="items-center"
          mutedClassName="text-store-orange-dark"
          homeButtonClassName="border-store-orange-dark text-store-orange-dark hover:bg-store-orange/15"
          onHeadHome={requestLeave}
          confirmingLeave={confirmingLeave}
          cart={
            <StoreCartReadout
              cart={cart}
              total={total}
              overdrawn={overdrawn}
              mutedClassName="text-store-orange-dark"
              overdrawnClassName="text-ink-red"
            />
          }
          checkout={
            cart.length > 0 && (
              <StoreCheckoutButton
                canCheckOut={canCheckOut}
                onCheckOut={checkOutAndLeave}
                className="border-store-orange bg-store-orange text-white hover:bg-store-orange-dark hover:border-store-orange-dark"
              />
            )
          }
        />
        <div className="bg-store-concrete text-ink-black px-6 py-4 grow min-h-0 overflow-auto">
          {/* The floor plan: wood along the left wall, machines straight
              ahead with the tools under them, supplies on the end cap.
              It lands on one screen on a tall window; a short one
              scrolls, and what runs past the fold is the tool shelf. */}
          <div className="flex h-full min-h-0 gap-6">
            {/* The wood wall: racks of solid stock with the sheet rack
                shelved underneath, the way a yard keeps its sheets flat
                below the lumber. The shelf below is what sets this
                column's width; the racks center in it. */}
            <div className="shrink-0 flex flex-col gap-4">
              <section>
                <h2 className="aisle-heading">Lumber</h2>
                <BoardSelector store="orangeBox" />
              </section>
              <StoreSheetGoodsSection />
            </div>
            {/* The main run, straight ahead as you come in the door:
                machines at eye level with the tool shelf under them,
                running the full width. Independent runs rather than a
                grid — a grid would hold every aisle in a row to the
                tallest one's height, and these are nothing like each
                other's height. */}
            <div className="grow min-w-0 flex flex-col gap-4">
              <div className="flex min-w-0 gap-6">
                {/* The machines want a particular width — three tiles,
                    each wide enough to run a photo full size, no wider —
                    so they take a basis and give the slack to the
                    supplies rather than stretching across a whole wall. */}
                <StoreMachinesSection className="basis-[40rem] grow-0 shrink" />
                {/* The end cap: supplies off to the side, where you grab
                    a box of screws on the way out. */}
                <StoreSuppliesSection className="basis-64 grow shrink-0" />
              </div>
              <StoreToolsSection />
            </div>
          </div>
        </div>
      </div>
    </TripOverlay>
  );
};
