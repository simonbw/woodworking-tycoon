import React from "react";
import { dismissTutorialAction } from "../../game/game-actions/progression-actions";
import {
  currentTutorialGoalView,
  TutorialStep,
  TutorialStepId,
} from "../../game/tutorial";
import { classNames } from "../../utils/classNames";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { Thumbtack } from "../Thumbtack";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The guided opening as the character's own to-do list (see
 * game/tutorial.ts): one goal at a time, its steps as checkboxes that
 * tick off as the shop's state satisfies them. The list comes from the
 * shop's own state, so this card never gets ahead of the player or stuck
 * behind them — it just renders whatever is next.
 *
 * The whole card is handwriting (`font-ink`) — it's a note the character
 * pinned up, not chrome. The prose lives here rather than in the step
 * table so instructions can name their keys through the shortcut
 * registry: rebind a key and these sentences follow.
 */
export const TutorialCard: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const view = currentTutorialGoalView(gameState);

  if (view === null) {
    return null;
  }

  const activeIndex = view.checked.findIndex((checked) => !checked);
  const activeStep = activeIndex >= 0 ? view.goal.steps[activeIndex] : null;

  return (
    <section
      className="paper-card relative space-y-2 font-ink"
      data-testid="tutorial-card"
    >
      <Thumbtack />
      <header className="border-b-2 border-ink-black/40 pb-1">
        <h3 className="text-lg leading-tight" data-testid="tutorial-goal">
          {view.goal.title}
        </h3>
      </header>
      <ul className="space-y-1">
        {view.goal.steps.map((step, index) => (
          <ChecklistRow
            key={step.id}
            step={step}
            checked={view.checked[index]}
            active={index === activeIndex}
          />
        ))}
      </ul>
      {activeStep !== null && (
        <div className="border-t border-ink-black/20 pt-1.5 text-base leading-snug">
          <StepBody step={activeStep.id} />
        </div>
      )}
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

const ChecklistRow: React.FC<{
  step: TutorialStep;
  checked: boolean;
  active: boolean;
}> = ({ step, checked, active }) => (
  <li
    className={classNames(
      "flex items-baseline gap-2 text-base leading-tight",
      checked && "text-ink-fade line-through decoration-ink-fade/70",
      !checked && !active && "text-ink-black/70",
    )}
    data-testid={`tutorial-step-${step.id}`}
    data-checked={checked}
  >
    <span
      aria-hidden
      className="relative top-0.5 flex h-[1em] w-[1em] flex-none items-center justify-center rounded-[2px] border-2 border-ink-black/70"
    >
      {checked && <span className="text-[1.1em] leading-none">✓</span>}
    </span>
    {step.label}
  </li>
);

/**
 * What to do, in plain instruction-manual voice. Every key comes from the
 * registry — never a hard-coded glyph.
 */
const StepBody: React.FC<{ step: TutorialStepId }> = ({ step }) => {
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
          You have the wood for a shelf: two thick stringers and three deck
          boards. Load them at the bench, choose the plan{" "}
          <em>Build Rustic Pallet Shelf</em>, then set each piece in place and
          drive the nails home.
        </p>
      );
    case "sellShelf":
      return (
        <p>
          The for-sale stand at the end of the driveway is where work gets sold.
          Pick the shelf up with <ShortcutKeys shortcut="pick-up" />, carry it
          down, and set it out with <ShortcutKeys shortcut="put-down" />.
          Someone walking by will buy it before long.
        </p>
      );
    case "learnSkill":
      return (
        <p>
          Building the shelf earned your first level, and a level is a skill
          point. Open the journal with <ShortcutKeys shortcut="open-journal" />{" "}
          and learn <em>Rustic Projects</em> — it teaches the birdhouse.
        </p>
      );
    case "goToStore":
      return (
        <p>
          The birdhouse's parts have to be cut to length, and that takes a saw.
          Press <ShortcutKeys shortcut="pick-up" /> at the truck's cab and pick
          the Orange Box.
        </p>
      );
    case "addSawToCart":
      return (
        <p>
          The hand saw hangs on the tool wall. Add it to the cart — the shelf
          money covers it.
        </p>
      );
    case "checkOut":
      return (
        <p>
          The register takes what the cart holds, and everything you bought
          rides home in the truck's bed.
        </p>
      );
    case "gatherWood":
      return (
        <p>
          The birdhouse takes two whole pallet boards. If the shop is short,
          take the truck out for another pallet and pry it apart.
        </p>
      );
    case "mountSaw":
      return (
        <p>
          A hand tool only works where it's mounted. Take the saw from the bed,
          carry it to the workbench, open the bench with{" "}
          <ShortcutKeys shortcut="open-station-sheet" />, and put it in the tool
          rack.
        </p>
      );
    case "cutParts":
      return (
        <p>
          Cut the birdhouse's parts at the bench: two 12-inch fronts, each with
          one end cut at the 45° stop, a 12-inch roof, a 12-inch floor, and two
          6-inch sides. The plan <em>Build Birdhouse</em> lists each part as you
          go.
        </p>
      );
    case "assembleBirdhouse":
      return (
        <p>
          Load the parts at the bench, choose the plan <em>Build Birdhouse</em>,
          then set each piece on the drawing and nail it down.
        </p>
      );
    case "earnSavings":
      return (
        <p>
          Anything finished sells at the stand. Keep scavenging, building, and
          setting work out — the savings open the way to better machines and
          better wood.
        </p>
      );
  }
};
