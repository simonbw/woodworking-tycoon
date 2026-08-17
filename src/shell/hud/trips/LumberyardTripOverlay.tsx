import React from "react";
import { SawyerAndSonsLogo } from "../../../components/lumberyard-page/SawyerAndSonsLogo";

import { TripOverlay } from "../../../components/trip/TripOverlay";
import { StoreCartReadout, StoreCheckoutButton } from "../store/StoreCart";
import { useShopState } from "../../useShell";
import { BoardSelector } from "./BoardSelector";
import { TripHeader } from "./TripHeader";
import { useStoreTrip } from "./useStoreTrip";

/**
 * A trip to Sawyer & Sons, the hardwood lumberyard across town. Reached by
 * walking out the garage door (see TruckPrompt) once reputation opens the
 * gate; shown while the player's away trip is a shopping one to the yard.
 * Same trip rules as Orange Box: the shop keeps ticking back home, and
 * Head Home is the only way back.
 *
 * Everything here is milled short of S4S — the racks are the milling
 * chain's reason to exist. Wood that's ready to use stays at the big box.
 */
export const LumberyardTripOverlay: React.FC = () => {
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
    gameState.player.away.store !== "lumberyard"
  ) {
    return null;
  }

  return (
    <TripOverlay label="Sawyer & Sons" onHeadHome={requestLeave}>
      <div className="rounded-md overflow-hidden shadow-2xl border border-mill-green-dark grow min-h-0 flex flex-col">
        <TripHeader
          brand={<SawyerAndSonsLogo className="h-12 w-auto shrink-0" />}
          tagline="Hardwoods · Rough & Surfaced · Since 1962"
          barClassName="bg-mill-green text-paper-cream"
          brandRowClassName="items-baseline"
          mutedClassName="text-paper-cream/80"
          homeButtonClassName="border-paper-cream/80 hover:bg-paper-cream/15"
          onHeadHome={requestLeave}
          confirmingLeave={confirmingLeave}
          cart={
            <StoreCartReadout
              cart={cart}
              total={total}
              overdrawn={overdrawn}
              mutedClassName="text-paper-cream/80"
              // Ink red vanishes into the yard's green bar — the tag on
              // the total has to shout from across the lot
              overdrawnClassName="text-red-300"
            />
          }
          checkout={
            cart.length > 0 && (
              <StoreCheckoutButton
                canCheckOut={canCheckOut}
                onCheckOut={checkOutAndLeave}
                className="border-paper-cream bg-paper-cream text-mill-green-dark hover:bg-white hover:border-white"
              />
            )
          }
        />
        <div className="bg-mill-timber text-ink-black p-6 grow min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto pt-2">
            <BoardSelector store="lumberyard" />
          </div>
        </div>
      </div>
    </TripOverlay>
  );
};
