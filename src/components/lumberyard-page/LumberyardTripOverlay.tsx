import React from "react";
import { returnFromStoreAction } from "../../game/game-actions/door-actions";
import { BoardSelector } from "../store-page/BoardSelector";
import { TripHeader } from "../trip/TripHeader";
import { TripOverlay } from "../trip/TripOverlay";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * A trip to Sawyer & Sons, the hardwood lumberyard across town. Reached by
 * walking out the garage door (see DoorPrompt) once reputation opens the
 * gate; shown while the player's away trip is a shopping one to the yard.
 * Same trip rules as Orange Box: the shop keeps ticking back home, and
 * Head Home is the only way back.
 *
 * Everything here is milled short of S4S — the racks are the milling
 * chain's reason to exist. Wood that's ready to use stays at the big box.
 */
export const LumberyardTripOverlay: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const headHome = () => applyAction(returnFromStoreAction());

  if (
    gameState.player.away?.kind !== "shopping" ||
    gameState.player.away.store !== "lumberyard"
  ) {
    return null;
  }

  return (
    <TripOverlay label="Sawyer & Sons" onHeadHome={headHome}>
      <div className="rounded-md overflow-hidden shadow-2xl border border-mill-green-dark grow min-h-0 flex flex-col">
        <TripHeader
          brand={
            <span className="font-lumberjack text-4xl tracking-wide leading-none">
              Sawyer &amp; Sons
            </span>
          }
          tagline="Hardwoods · Rough & Surfaced · Since 1962"
          barClassName="bg-mill-green text-paper-cream"
          brandRowClassName="items-baseline"
          mutedClassName="text-paper-cream/80"
          homeButtonClassName="border-paper-cream/80 hover:bg-paper-cream/15"
          onHeadHome={headHome}
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
