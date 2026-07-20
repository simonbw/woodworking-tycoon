import React from "react";
import { dismissDustTipAction } from "../game/game-actions/progression-actions";
import { ShortcutKeys } from "./shortcuts/Kbd";
import { Thumbtack } from "./Thumbtack";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * One-time shop note that appears when the floor first gets properly
 * dusty (progression.sweepingUnlocked), teaching the broom loop. "Got
 * it" retires it for good via dustTipDismissed.
 */
export const DustTutorialCard: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { sweepingUnlocked, dustTipDismissed } = gameState.progression;

  if (!sweepingUnlocked || dustTipDismissed) {
    return null;
  }

  return (
    <section className="paper-card relative mb-6 space-y-2">
      <Thumbtack />
      <header className="border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          That's a Lot of Sawdust
        </h3>
      </header>
      <p className="text-sm leading-snug">
        Left on the floor, sawdust slows your machines and your feet. There's a
        broom in the corner now: sweep <ShortcutKeys shortcut="sweep" /> pushes
        the dust underfoot into a pile in front of you. Scoop the pile up and
        dump it in the garbage can.
      </p>
      <div className="flex justify-end">
        <button
          className="button px-3 py-1 text-sm tracking-[0.15em]"
          onClick={() => applyAction(dismissDustTipAction())}
        >
          Got It
        </button>
      </div>
    </section>
  );
};
