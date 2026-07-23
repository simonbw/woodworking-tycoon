import React, { useState } from "react";
import { hasUnreadArticles } from "../game/manual";
import { useManual } from "./manual/ManualProvider";
import { JournalModal } from "./journal/JournalModal";
import { PhoneModal } from "./phone/PhoneModal";
import { SettingsMenu } from "./SettingsMenu";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { Ticker } from "./Ticker";
import { Tooltip } from "./Tooltip";
import { useGameState, useQuitToMenu } from "./useGameState";

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
  const quitToMenu = useQuitToMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const manual = useManual();
  const manualHasNews = hasUnreadArticles(gameState.progression);

  useShortcut("open-phone", () => setPhoneOpen(true), marketplaceUnlocked);
  useShortcut("open-journal", () => setJournalOpen(true));
  useShortcut("open-settings", () => setSettingsOpen(true));

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
          <Tooltip content="Your journal — skills" shortcut="open-journal">
            <button
              className="button-ghost relative"
              onClick={() => setJournalOpen(true)}
              data-sfx="ui-tab"
            >
              Journal
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
          <Tooltip content="Settings" shortcut="open-settings">
            <button
              className="button-ghost text-lg leading-none"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              ⚙
            </button>
          </Tooltip>
          <Tooltip content="Save and return to main menu">
            <button
              className="button-ghost"
              onClick={quitToMenu}
              data-sfx="ui-back"
            >
              Save &amp; Quit
            </button>
          </Tooltip>
        </div>
      </div>
      {/* The desk edge the old folder tabs used to merge into */}
      <div className="h-0.5 bg-paper-manila/40" />
      {settingsOpen && <SettingsMenu onClose={() => setSettingsOpen(false)} />}
      {phoneOpen && <PhoneModal onClose={() => setPhoneOpen(false)} />}
      {journalOpen && <JournalModal onClose={() => setJournalOpen(false)} />}
    </nav>
  );
};

/** The shop's cash balance, drawn on the bar in the money accent. */
const Balance: React.FC = () => {
  const gameState = useGameState();
  return (
    <section className="flex items-baseline gap-2">
      <div className="font-mono text-lg text-gold tabular-nums leading-none">
        ${gameState.money.toFixed(2)}
      </div>
    </section>
  );
};
