import React, { useState } from "react";
import { hasUnreadArticles } from "../game/manual";
import { xpProgress } from "../game/skill-helpers";
import { useManual } from "./manual/ManualProvider";
import { JournalModal } from "./journal/JournalModal";
import { PhoneModal } from "./phone/PhoneModal";
import { PauseMenu } from "./PauseMenu";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { Ticker } from "./Ticker";
import { Tooltip } from "./Tooltip";
import { useGameState } from "./useGameState";

/**
 * The top chrome strip: no tabs — every screen that used to be one is an
 * object in the world now (the store is out the garage door, the
 * marketplace lives on your phone, skills in your journal). What's left is
 * the clock, the cash, and the pocket items, drawn on the dark workshop
 * chrome above the desk edge.
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
    <nav className="relative">
      <div className="flex items-center gap-6 pb-1.5 pr-2">
        <h1 className="font-condensed uppercase tracking-[0.3em] text-sm text-paper-manila/70 leading-none pl-1">
          {gameState.shopInfo.name}
        </h1>
        <div className="grow" />
        <Ticker />
        <Balance />
        <div className="flex items-center gap-3">
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
            content={`Your journal — skills. ${xp.needed - xp.current} XP to the next skill point`}
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
                  className="absolute -right-3 -top-1.5 rounded-full bg-gold px-1 font-mono text-[0.6rem] leading-relaxed text-ink-black"
                  data-testid="journal-badge"
                >
                  {skillPoints}
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
        </div>
      </div>
      {/* The desk edge the old folder tabs used to merge into */}
      <div className="h-0.5 bg-paper-manila/40" />
      {pauseOpen && <PauseMenu onClose={() => setPauseOpen(false)} />}
      {phoneOpen && <PhoneModal onClose={() => setPhoneOpen(false)} />}
      {journalOpen && <JournalModal onClose={() => setJournalOpen(false)} />}
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
    <section className="flex items-baseline gap-4">
      <div
        className="font-mono text-lg text-gold tabular-nums leading-none"
        data-reward-target="money"
        data-testid="balance"
      >
        ${gameState.money.toFixed(2)}
      </div>
      <Tooltip content="Shop reputation — better lumber, more job slots, higher prices">
        <div
          className="font-mono text-lg text-gold-light tabular-nums leading-none"
          data-reward-target="reputation"
          data-testid="reputation"
        >
          ★ {gameState.reputation.toFixed(1)}
        </div>
      </Tooltip>
    </section>
  );
};
