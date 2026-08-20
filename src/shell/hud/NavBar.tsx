import React, { useState } from "react";
import { DayDial } from "../../components/DayDial";
import { useShortcut } from "../../components/shortcuts/ShortcutProvider";
import { StarIcon } from "../../components/StarIcon";
import { Tooltip } from "../../components/Tooltip";
import { hasUnreadArticles } from "../../game/manual";
import { xpProgress } from "../../game/skill-helpers";
import { TICKS_PER_DAY } from "../../game/time";
import { currentDayPhase, dayTicksSpent, isNight } from "../../game/time-flow";
import {
  formatCount,
  formatDecimal,
  formatMoney,
} from "../../utils/formatNumber";
import { escapeClaimedByWorld } from "../dispatch/escapeClaims";
import { useGame, useShopState } from "../useShell";
import { JournalModal } from "./journal/JournalModal";
import { useManual } from "./manual/ManualProvider";
import { PauseMenu } from "./PauseMenu";

/**
 * The top of the HUD, ported from the old shell's NavBar: no tabs — every
 * screen that used to be one is an object in the world now (the store is
 * out the garage door, skills in your journal). What's left is one chrome
 * chip on the right, split by hairlines into three segments: the clock,
 * the balances, and the pocket items (plus Menu for the pause screen),
 * floating over the lot. The row itself passes clicks through to the
 * world; only the chip catches them.
 */
export const NavBar: React.FC = () => {
  const gameState = useShopState();
  const game = useGame();
  const { skillPoints } = gameState.progression;
  const xp = xpProgress(gameState.progression.xp);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const manual = useManual();
  const manualHasNews = hasUnreadArticles(gameState.progression);

  // In the old shell one provider held every Escape binding, and registry
  // order let an open sheet or door card claim the key ahead of the pause
  // menu. Here those bindings live in the engine's ShortcutDispatcher, so
  // this one steps aside exactly when that one answers (a sheet, a trip
  // card, a receipt, or a bench the player is leaned over).
  const floorClaimsEscape = escapeClaimedByWorld(game);

  useShortcut("open-journal", () => setJournalOpen(true));
  useShortcut("pause-menu", () => setPauseOpen(true), !floorClaimsEscape);

  return (
    <nav className="pointer-events-none flex items-start justify-end gap-4">
      <div className="hud-chip pointer-events-auto flex items-stretch divide-x divide-workshop-edge">
        <div className="flex items-center px-4 py-1.5">
          <DayClock />
        </div>
        <div className="flex items-center px-4 py-1.5">
          <Balance />
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5">
          <Tooltip
            content={`Your journal — skills. ${formatCount(xp.needed - xp.current)} XP to the next skill point`}
            shortcut="open-journal"
          >
            <button
              className="button-ghost relative"
              onClick={() => setJournalOpen(true)}
              data-sfx="ui-tab"
              data-reward-target="xp"
              data-tutorial-target="navbar-journal"
            >
              Skills
              <XpMeter current={xp.current} needed={xp.needed} />
              {skillPoints > 0 && (
                <span
                  className="absolute -right-3 -top-1.5 rounded-full bg-gold px-1 font-semibold text-[0.6rem] leading-relaxed tabular-nums text-ink-black"
                  data-testid="journal-badge"
                >
                  {formatCount(skillPoints)}
                </span>
              )}
            </button>
          </Tooltip>
          <Tooltip content="Shop manual" shortcut="toggle-help">
            <button
              className="button-ghost relative text-lg leading-none"
              onClick={() => manual.open()}
              aria-label="Shop manual"
              // The manual's own book-open sound plays as it appears
              // (ManualProvider); the generic click would stack on top.
              data-sfx="none"
            >
              ?
              {manualHasNews && (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold"
                  data-testid="manual-badge"
                  aria-hidden
                />
              )}
            </button>
          </Tooltip>
          <Tooltip content="Pause & settings" shortcut="pause-menu">
            <button
              className="button-ghost"
              onClick={() => setPauseOpen(true)}
              data-sfx="ui-tab"
            >
              Menu
            </button>
          </Tooltip>
        </div>
      </div>
      {/* Modals sit outside the pass-through row so they keep their own
          pointer events (Modal renders in place, not through a portal);
          absolute so the empty wrapper doesn't count as a flex child */}
      <div className="pointer-events-auto absolute">
        {pauseOpen && <PauseMenu onClose={() => setPauseOpen(false)} />}
        {journalOpen && <JournalModal onClose={() => setJournalOpen(false)} />}
      </div>
    </nav>
  );
};

/** The old DayClock over the shell hooks (the loop it rode moved into
 * the engine). Exported because it isn't only the top bar's: the trip
 * pages show this exact readout (the daylight left is the cost being
 * weighed out there). */
export const DayClock: React.FC = () => {
  const gameState = useShopState();
  const phase = currentDayPhase(gameState);

  return (
    <Tooltip
      content={`${capitalize(phase)} of day ${formatCount(gameState.day)}`}
    >
      <DayDial
        dayProgress={dayTicksSpent(gameState) / TICKS_PER_DAY}
        night={isNight(gameState)}
        phase={phase}
        day={gameState.day}
      />
    </Tooltip>
  );
};

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

/**
 * How close the next skill point is, drawn as a hairline along the bottom of
 * the Skills button — the journal's XP row without opening the journal. The
 * numbers live in the button's tooltip, so this is decoration for readers.
 */
const XpMeter: React.FC<{ current: number; needed: number }> = ({
  current,
  needed,
}) => (
  <span
    className="absolute inset-x-1 bottom-0.5 block h-0.5 overflow-hidden rounded-full bg-paper-manila/25"
    data-testid="xp-meter"
    aria-hidden
  >
    <span
      className="block h-full rounded-full bg-gold transition-[width] duration-300"
      style={{ width: `${(current / needed) * 100}%` }}
      data-testid="xp-meter-fill"
    />
  </span>
);

/**
 * The shop's standing: cash and reputation, both set exactly like the
 * clock — bold condensed, tabular figures — in the one gold accent. The
 * star flows inline with the digits (StarIcon carries its own baseline
 * nudge), so both readouts share a text baseline; wrapping it in a flex
 * row would hand the group's baseline to the SVG instead. Both are
 * targets for the reward flight after a stand sale (see
 * `RewardFlightLayer`) — you should see the star land.
 */
const Balance: React.FC = () => {
  const gameState = useShopState();
  return (
    <section className="flex items-baseline gap-3">
      <div
        className="font-condensed font-bold text-base text-gold tabular-nums leading-none"
        data-reward-target="money"
        data-testid="balance"
      >
        {formatMoney(gameState.money)}
      </div>
      <Tooltip content="Shop reputation — word of your work getting around. It opens better lumber sources.">
        <div
          className="font-condensed font-bold text-base text-gold tabular-nums leading-none"
          data-reward-target="reputation"
          data-testid="reputation"
        >
          <StarIcon className="mr-1" />
          {formatDecimal(gameState.reputation)}
        </div>
      </Tooltip>
    </section>
  );
};
