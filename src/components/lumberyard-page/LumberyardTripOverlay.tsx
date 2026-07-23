import React from "react";
import { returnFromStoreAction } from "../../game/game-actions/door-actions";
import { useModalScope, useShortcut } from "../shortcuts/ShortcutProvider";
import { useApplyGameAction, useGameState } from "../useGameState";
import { BoardSelector } from "../store-page/BoardSelector";

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

  if (
    gameState.player.away?.kind !== "shopping" ||
    gameState.player.away.store !== "lumberyard"
  ) {
    return null;
  }
  return <LumberyardTrip />;
};

/** Split out so the modal-scope hooks only run while the trip is live. */
const LumberyardTrip: React.FC = () => {
  const applyAction = useApplyGameAction();
  const headHome = () => applyAction(returnFromStoreAction());

  useModalScope();
  useShortcut("close-modal", headHome);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-workshop-bg p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Sawyer & Sons"
    >
      <div className="rounded-md overflow-hidden shadow-2xl border border-mill-green-dark grow min-h-0 flex flex-col">
        <YardSignBar onHeadHome={headHome} />
        <div className="bg-mill-timber text-ink-black p-6 grow min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <section>
              <h2 className="yard-heading">In the Racks</h2>
              <BoardSelector store="lumberyard" />
            </section>
            <p className="mt-4 font-ink text-lg text-ink-brown/80">
              Sold as it comes off the stack. Milling's your department.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const YardSignBar: React.FC<{ onHeadHome: () => void }> = ({ onHeadHome }) => {
  const gameState = useGameState();
  return (
    <div className="bg-mill-green text-paper-cream px-6 py-3 flex items-center justify-between">
      <div className="flex items-baseline gap-4">
        <span className="font-stencil text-3xl uppercase tracking-widest leading-none">
          Sawyer &amp; Sons
        </span>
        <span className="font-condensed uppercase tracking-[0.3em] text-xs text-paper-cream/80">
          Hardwoods · Rough &amp; Surfaced · Since 1962
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end font-mono leading-tight">
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-paper-cream/80">
            Your Wallet
          </span>
          <span className="text-xl tabular-nums">
            ${gameState.money.toFixed(2)}
          </span>
        </div>
        <button
          className="border-2 border-paper-cream/80 rounded-sm px-3 py-1.5 font-condensed font-bold uppercase tracking-[0.2em] text-sm hover:bg-paper-cream/15"
          onClick={onHeadHome}
          data-sfx="ui-back"
        >
          Head Home
        </button>
      </div>
    </div>
  );
};
