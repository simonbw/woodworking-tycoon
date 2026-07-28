import React, { useState } from "react";
import { hasUnreadArticles } from "../game/manual";
import { xpProgress } from "../game/skill-helpers";
import { formatCount, formatDecimal, formatMoney } from "../utils/formatNumber";
import { useManual } from "./manual/ManualProvider";
import { JournalModal } from "./journal/JournalModal";
import { PhoneModal } from "./phone/PhoneModal";
import { PauseMenu } from "./PauseMenu";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { StarIcon } from "./StarIcon";
import { Ticker } from "./Ticker";
import { Tooltip } from "./Tooltip";
import { useGameState } from "./useGameState";

/**
 * The top of the HUD: no tabs — every screen that used to be one is an
 * object in the world now (the store is out the garage door, the
 * marketplace lives on your phone, skills in your journal). What's left
 * is one chrome chip on the right, split by hairlines into three
 * segments: the clock, the balances, and the pocket items (plus Menu
 * for the pause screen), floating over the lot. The row itself passes
 * clicks through to the world; only the chip catches them.
 */
export const NavBar: React.FC = () => {
  const gameState = useGameState();
  const { marketplaceUnlocked, skillPoints } = gameState.progression;
  const xp = xpProgress(gameState.progression.xp);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const manual = useManual();
  const manualHasNews = hasUnreadArticles(gameState.progression);

  useShortcut("open-phone", () => setPhoneOpen(true), marketplaceUnlocked);
  useShortcut("open-journal", () => setJournalOpen(true));
  useShortcut("pause-menu", () => setPauseOpen(true));

  return (
    <nav className="pointer-events-none flex items-start justify-end gap-4">
      <div className="hud-chip pointer-events-auto flex items-stretch divide-x divide-workshop-edge">
        <div className="flex items-center px-4 py-1.5">
          <Ticker />
        </div>
        <div className="flex items-center px-4 py-1.5">
          <Balance />
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5">
          {marketplaceUnlocked && (
            <Tooltip content="Your phone — SawdustList" shortcut="open-phone">
              <button
                className="button-ghost"
                onClick={() => setPhoneOpen(true)}
                data-sfx="ui-tab"
              >
                Phone
              </button>
            </Tooltip>
          )}
          <Tooltip
            content={`Your journal — skills. ${formatCount(xp.needed - xp.current)} XP to the next skill point`}
            shortcut="open-journal"
          >
            <button
              className="button-ghost relative"
              onClick={() => setJournalOpen(true)}
              data-sfx="ui-tab"
              data-reward-target="xp"
            >
              Skills
              <XpMeter current={xp.current} needed={xp.needed} />
              {skillPoints > 0 && (
                <span
                  className="absolute -right-3 -top-1.5 rounded-full bg-gold px-1 font-mono text-[0.6rem] leading-relaxed tabular-nums text-ink-black"
                  data-testid="journal-badge"
                >
                  {formatCount(skillPoints)}
                </span>
              )}
            </button>
          </Tooltip>
          <Tooltip content="Shop manual" shortcut="toggle-help">
            <button
              className="button-ghost relative text-lg leading-none font-mono"
              onClick={() => manual.open()}
              aria-label="Shop manual"
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
        {phoneOpen && <PhoneModal onClose={() => setPhoneOpen(false)} />}
        {journalOpen && <JournalModal onClose={() => setJournalOpen(false)} />}
      </div>
    </nav>
  );
};

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
 * The shop's standing: cash and reputation, drawn on the bar in the money
 * accent. Both are targets for the reward flight after a handoff (see
 * `RewardFlightLayer`), which is also why reputation lives out here now
 * rather than only inside the phone — you should see the star land.
 */
const Balance: React.FC = () => {
  const gameState = useGameState();
  return (
    <section className="flex items-baseline gap-3">
      <div
        className="font-mono text-base text-gold tabular-nums leading-none"
        data-reward-target="money"
        data-testid="balance"
      >
        {formatMoney(gameState.money)}
      </div>
      <Tooltip content="Shop reputation — better lumber, more job slots, higher prices">
        <div
          className="font-mono text-base text-gold-light tabular-nums leading-none flex items-center gap-1.5"
          data-reward-target="reputation"
          data-testid="reputation"
        >
          <StarIcon />
          {formatDecimal(gameState.reputation)}
        </div>
      </Tooltip>
    </section>
  );
};
