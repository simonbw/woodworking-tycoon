import React, { useState } from "react";
import { ShortcutId } from "../game/shortcuts";
import { classNames } from "../utils/classNames";
import { SettingsMenu } from "./SettingsMenu";
import { useHelpOverlay } from "./shortcuts/ShortcutHelpOverlay";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { Ticker } from "./Ticker";
import { Tooltip } from "./Tooltip";
import { useUiMode } from "./UiMode";
import { useGameState, useQuitToMenu } from "./useGameState";

export const NavBar: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { storeUnlocked, marketplaceUnlocked } = gameState.progression;
  const quitToMenu = useQuitToMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const help = useHelpOverlay();

  useShortcut("nav-home", () => setMode({ mode: "normal" }));
  useShortcut("nav-store", () => setMode({ mode: "store" }), storeUnlocked);
  useShortcut(
    "nav-marketplace",
    () => setMode({ mode: "marketplace" }),
    marketplaceUnlocked,
  );
  useShortcut("nav-skills", () => setMode({ mode: "skills" }));
  useShortcut("open-settings", () => setSettingsOpen(true));

  return (
    <nav className="relative">
      <div className="flex gap-1 items-end pr-2">
        <FolderTab
          label="Home"
          shortcut="nav-home"
          active={mode.mode === "normal"}
          onClick={() => setMode({ mode: "normal" })}
        />
        {storeUnlocked && (
          <FolderTab
            label="Store"
            shortcut="nav-store"
            active={mode.mode === "store"}
            onClick={() => setMode({ mode: "store" })}
          />
        )}
        {marketplaceUnlocked && (
          <FolderTab
            label="Marketplace"
            shortcut="nav-marketplace"
            active={mode.mode === "marketplace"}
            onClick={() => setMode({ mode: "marketplace" })}
          />
        )}
        <FolderTab
          label={
            gameState.progression.skillPoints > 0
              ? `Skills (${gameState.progression.skillPoints})`
              : "Skills"
          }
          shortcut="nav-skills"
          active={mode.mode === "skills"}
          onClick={() => setMode({ mode: "skills" })}
        />
        <div className="grow" />
        <div className="self-center mb-1.5 mr-6 flex items-center gap-6">
          <Ticker />
          <Balance />
        </div>
        <Tooltip content="Keyboard shortcuts" shortcut="toggle-help">
          <button
            className="button-ghost mb-1.5 self-center text-lg leading-none font-mono"
            onClick={help.open}
            aria-label="Keyboard shortcuts"
          >
            ?
          </button>
        </Tooltip>
        <Tooltip content="Settings" shortcut="open-settings">
          <button
            className="button-ghost mb-1.5 self-center text-lg leading-none"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </Tooltip>
        <Tooltip content="Save and return to main menu">
          <button
            className="button-ghost mb-1.5 self-center"
            onClick={quitToMenu}
            data-sfx="ui-back"
          >
            Save &amp; Quit
          </button>
        </Tooltip>
      </div>
      {/* Folder body — the rule that the active tab merges into */}
      <div className="h-0.5 bg-paper-manila/40" />
      {settingsOpen && <SettingsMenu onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
};

/** The shop's cash balance, drawn on the bar in the money accent. */
const Balance: React.FC = () => {
  const gameState = useGameState();
  return (
    <section className="flex items-baseline gap-2">
      <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-paper-manila/60">
        Balance
      </span>
      <div className="font-mono text-lg text-gold tabular-nums leading-none">
        ${gameState.money.toFixed(2)}
      </div>
    </section>
  );
};

const FolderTab: React.FC<{
  label: string;
  shortcut: ShortcutId;
  active: boolean;
  onClick: () => void;
}> = ({ label, shortcut, active, onClick }) => {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        onClick={onClick}
        data-sfx="ui-tab"
        className={classNames(
          "relative px-5 pt-2 pb-1 rounded-t-md font-condensed uppercase tracking-[0.15em] text-sm transition-colors",
          active
            ? "bg-paper-manila text-ink-black pb-2 -mb-0.5 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.2)]"
            : "bg-paper-manila/40 text-paper-manila hover:bg-paper-manila/60 hover:text-ink-black mb-0",
        )}
      >
        {label}
      </button>
    </Tooltip>
  );
};
