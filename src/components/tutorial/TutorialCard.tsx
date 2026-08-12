import React, { useEffect, useRef } from "react";
import { dismissTutorialAction } from "../../game/game-actions/progression-actions";
import {
  TutorialGoalId,
  TutorialGoalView,
  TutorialStep,
  TutorialStepId,
  tutorialViews,
} from "../../game/tutorial";
import { playMarkerCheck } from "../../utils/markerSynth";
import {
  HandCheck,
  HandCheckbox,
  HandFrame,
  HandRule,
  HandStrike,
} from "../hand-drawn/HandDrawn";
import { ManualLink } from "../manual/ManualLink";
import { HintSurfaceContext, ShortcutKeys } from "../shortcuts/Kbd";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The tutorials as the character's own to-do list (see game/tutorial.ts):
 * one card per up track — the guided opening, and later the sweeping
 * lesson beneath it — each showing its current goal, its steps as
 * checkboxes that tick off as the shop's state satisfies them. The lists
 * come from the shop's own state, so a card never gets ahead of the
 * player or stuck behind them — it just renders whatever is next.
 *
 * Everything on a card is written rather than typeset: the sheet is
 * `.paper-note`, the hand is `.pencil-hand`, and the rules, boxes,
 * ticks, crossings-out, and key caps are drawn marks (see
 * `hand-drawn/HandDrawn.tsx`). A finished step keeps the same graphite as
 * the rest — the line through it is what says it's done, and the eye is
 * sent to the next thing by the outline in the world, not by fading the
 * list around it.
 *
 * The prose lives here rather than in the step table so instructions can
 * name their keys through the shortcut registry: rebind a key and these
 * sentences follow.
 */
export const TutorialCards: React.FC = () => {
  const gameState = useGameState();
  const views = tutorialViews(gameState);
  return (
    <>
      {views.map((view) => (
        <TutorialCard key={view.trackId} view={view} />
      ))}
    </>
  );
};

const TutorialCard: React.FC<{ view: TutorialGoalView }> = ({ view }) => {
  const applyAction = useApplyGameAction();

  useMarkerOnCheck(view.goal.id, view.checked);

  const activeIndex = view.checked.findIndex((checked) => !checked);
  const activeStep = activeIndex >= 0 ? view.goal.steps[activeIndex] : null;

  return (
    <HintSurfaceContext.Provider value="hand">
      <section
        className="paper-note pencil-hand relative space-y-2"
        data-testid={`tutorial-card-${view.trackId}`}
      >
        <header>
          <h3
            className="pencil-hand-heading leading-tight"
            data-testid="tutorial-goal"
          >
            {view.goal.title}
          </h3>
          <HandRule seed={view.goal.id} weight={2} className="mt-0.5" />
        </header>
        <ul className="space-y-1">
          {view.goal.steps.map((step, index) => (
            <ChecklistRow
              key={step.id}
              step={step}
              checked={view.checked[index]}
            />
          ))}
        </ul>
        {activeStep !== null && (
          <div className="space-y-1.5 leading-snug">
            <HandRule seed={`${view.goal.id}-body`} className="opacity-50" />
            <StepBody step={activeStep.id} />
          </div>
        )}
        <div className="flex items-center justify-between">
          {/* The sweeping lesson has a manual page behind it; the pointer
              rides its card the way it rode the old one-time note. */}
          <span>
            {view.trackId === "dust" && <ManualLink article="dust" />}
          </span>
          {/* Written on the sheet like everything else, with a box drawn
              around it — a printed button would be the one piece of
              chrome on a page of handwriting. */}
          <button
            className="relative px-3 py-0.5 text-[0.85em] hover:text-ink-black"
            onClick={() => applyAction(dismissTutorialAction(view.trackId))}
            data-testid="tutorial-skip"
          >
            <HandFrame seed="tutorial-skip" />
            <span className="relative">Skip</span>
          </button>
        </div>
      </section>
    </HintSurfaceContext.Provider>
  );
};

/**
 * Sound the felt tip whenever a box goes from open to ticked. It compares
 * against the previous render's boxes and stays quiet on the first one,
 * so a page load into a half-finished list doesn't tick off everything
 * already done.
 *
 * A new goal counts as a tick too: satisfying a goal's last step moves
 * the card straight on to the next goal, so that box never renders
 * checked — but it was still just crossed off.
 */
function useMarkerOnCheck(
  goalId: TutorialGoalId | null,
  checked: readonly boolean[] | null,
): void {
  const previous = useRef<{
    goalId: TutorialGoalId;
    checked: readonly boolean[];
  } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current =
      goalId === null || checked === null
        ? null
        : { goalId, checked: [...checked] };
    if (before === null || goalId === null || checked === null) return;
    const ticked =
      before.goalId !== goalId ||
      checked.some((now, i) => now && !before.checked[i]);
    if (ticked) {
      playMarkerCheck();
    }
  }, [goalId, checked?.join("")]);
}

const ChecklistRow: React.FC<{
  step: TutorialStep;
  checked: boolean;
}> = ({ step, checked }) => (
  <li
    className="flex items-baseline gap-2 leading-tight"
    data-testid={`tutorial-step-${step.id}`}
    data-checked={checked}
  >
    {/* The box stays; the tick is drawn into it, running past the corner
        the way one does. */}
    <span
      aria-hidden
      className="relative top-[0.15em] flex flex-none items-center justify-center"
    >
      <HandCheckbox seed={step.id} />
      {checked && (
        <HandCheck
          seed={step.id}
          // Not dead centre: a tick sits high and right in its box,
          // because the long stroke is the one that has to clear it.
          className="absolute left-1/2 top-1/2 translate-x-[calc(-50%+0.06em)] translate-y-[calc(-50%-0.13em)]"
        />
      )}
    </span>
    <span className="relative">
      {step.label}
      {checked && <HandStrike seed={`${step.id}-strike`} />}
    </span>
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
          boards. Load them at the bench, open the plans with{" "}
          <ShortcutKeys shortcut="open-plan-browser" /> and pull{" "}
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
    case "getBroom":
      return (
        <p>
          Left on the floor, sawdust slows your machines and your feet. The
          Orange Box sells a broom — press <ShortcutKeys shortcut="pick-up" />{" "}
          at the truck's cab, drive over, and take one off the tool wall.
        </p>
      );
    case "sweepUp":
      return (
        <p>
          Pick the broom up with <ShortcutKeys shortcut="pick-up" />, then hold{" "}
          <ShortcutKeys shortcut="operate-machine" /> and walk to sweep the dust
          into the dustpan.
        </p>
      );
    case "emptyPan":
      return (
        <p>
          The pan rides on the broom. Stand at the garbage can and hold{" "}
          <ShortcutKeys shortcut="operate-machine" /> to pour it out.
        </p>
      );
  }
};
