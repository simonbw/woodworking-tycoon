import React from "react";
import { dismissTutorialAction } from "../../game/game-actions/progression-actions";
import { currentTutorialStep, TutorialStepId } from "../../game/tutorial";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { Thumbtack } from "../Thumbtack";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The guided opening, one instruction at a time (see game/tutorial.ts).
 * The step comes from the shop's own state, so this card never gets ahead
 * of the player or stuck behind them — it just renders whatever is next.
 *
 * The prose lives here rather than in the step table so instructions can
 * name their keys through the shortcut registry: rebind a key and these
 * sentences follow.
 */
export const TutorialCard: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const step = currentTutorialStep(gameState);

  if (step === null) {
    return null;
  }

  return (
    <section
      className="paper-card relative space-y-2"
      data-testid="tutorial-card"
    >
      <Thumbtack />
      <header className="border-b-2 border-ink-black/40 pb-1">
        <span className="block font-condensed text-[0.6rem] uppercase tracking-[0.25em] text-ink-fade">
          Getting Started
        </span>
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide leading-tight">
          {step.title}
        </h3>
      </header>
      <div className="text-sm leading-snug">
        <StepBody step={step.id} />
      </div>
      <div className="flex justify-end">
        <button
          className="button px-3 py-1 text-xs tracking-[0.15em]"
          onClick={() => applyAction(dismissTutorialAction())}
          data-testid="tutorial-skip"
        >
          Skip
        </button>
      </div>
    </section>
  );
};

/**
 * What to do, in plain instruction-manual voice. Every key comes from the
 * registry — never a hard-coded glyph.
 */
const StepBody: React.FC<{ step: TutorialStepId }> = ({ step }) => {
  const gameState = useGameState();

  switch (step) {
    case "scavenge":
      return (
        <p>
          Wood costs money, and you have none. Walk out the garage door to the
          truck's cab, press <ShortcutKeys shortcut="pick-up" />, and pick the
          scavenging trip. Pallets are free for the hauling.
        </p>
      );
    case "dismantle":
      return (
        <p>
          The pallet is in the bed — take it out with{" "}
          <ShortcutKeys shortcut="pick-up" />, carry it to the workbench, and
          set it down with <ShortcutKeys shortcut="put-down" />. Open the bench
          with <ShortcutKeys shortcut="open-station-sheet" />, choose the plan{" "}
          <em>Dismantle Pallet</em>, and pry the marked nails with the mouse.
          Every board comes free one pull at a time, and the nails go back in
          your tin.
        </p>
      );
    case "buildShelf":
      return (
        <p>
          You have the wood for Marguerite's shelf: two thick stringers and
          three deck boards. Load them at the bench, choose the plan{" "}
          <em>Build Rustic Pallet Shelf</em>, then set each piece in place and
          drive the nails home.
        </p>
      );
    case "loadShelf":
      return (
        <p>
          Finished work leaves the shop in the truck. Pick the shelf up with{" "}
          <ShortcutKeys shortcut="pick-up" />, stand at the truck's bed, and
          load it in with <ShortcutKeys shortcut="put-down" />.
        </p>
      );
    case "deliverShelf":
      return (
        <p>
          Walk around to the cab and press <ShortcutKeys shortcut="pick-up" />.
          The shelf is listed under work to deliver — take that row and drive it
          over.
        </p>
      );
    case "buildSecondShelf":
      return (
        <p>
          Marguerite paid, and word is getting around. Build another rustic
          shelf — this one is for sale, not for a client. A pallet only carries
          three stringers and a shelf wants two, so take the truck out for
          another one first.
        </p>
      );
    case "listShelf":
      return (
        <p>
          You have a phone now. Open it with{" "}
          <ShortcutKeys shortcut="open-phone" /> and put the shelf up for sale
          at whatever you think it's worth. Priced fair, anything sells
          eventually — this is how the shop pays for itself between clients.
        </p>
      );
    case "acceptJob":
      return (
        <p>
          The phone's other tab is the job board. Those are standing orders from
          strangers: they pay better than a listing and they build your
          reputation. Accept one you can fill from pallet wood, then build it,
          load the bed, and drive it over the way you did the shelf.
        </p>
      );
    case "buySandingBlock":
      return (
        <p>
          Take the truck to the Orange Box and buy a sanding block — it's how
          rough wood becomes something people pay for. Grab a box of nails while
          you're there, too. Purchases ride home in the bed.
        </p>
      );
    case "mountSandingBlock":
      return (
        <p>
          A hand tool only works where it's mounted. Carry the block to the
          workbench, open the bench with{" "}
          <ShortcutKeys shortcut="open-station-sheet" />, and put it in the tool
          rack. Its sanding plans then appear on that bench.
        </p>
      );
    case "learnSkill":
      // The point may not have landed yet — XP comes from finished work, so
      // the honest instruction is "keep going", not "spend what you lack".
      return gameState.progression.skillPoints > 0 ? (
        <p>
          Finished work earns experience, and you've leveled up. Open the
          journal with <ShortcutKeys shortcut="open-journal" /> and learn{" "}
          <em>Rustic Projects</em> — birdhouses and crates, which the job board
          starts asking for as soon as you can build them.
        </p>
      ) : (
        <p>
          Every piece you finish earns experience, and a level earns a skill
          point to spend in the journal (
          <ShortcutKeys shortcut="open-journal" />
          ). Keep building and selling — you're close.
        </p>
      );
  }
};
