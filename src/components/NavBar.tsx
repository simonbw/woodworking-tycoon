import React from "react";
import { classNames } from "../utils/classNames";
import { useUiMode } from "./UiMode";
import { useGameState, useQuitToMenu } from "./useGameState";

export const NavBar: React.FC = () => {
  const { mode, setMode } = useUiMode();
  const gameState = useGameState();
  const { storeUnlocked, shopLayoutUnlocked } = gameState.progression;
  const quitToMenu = useQuitToMenu();

  return (
    <nav className="relative">
      <div className="flex gap-1 items-end pr-2">
        <FolderTab
          label="Home"
          active={mode.mode === "normal"}
          onClick={() => setMode({ mode: "normal" })}
        />
        {storeUnlocked && (
          <FolderTab
            label="Store"
            active={mode.mode === "store"}
            onClick={() => setMode({ mode: "store" })}
          />
        )}
        {shopLayoutUnlocked && (
          <FolderTab
            label="Shop Layout"
            active={mode.mode === "shopLayout"}
            onClick={() => setMode({ mode: "shopLayout" })}
          />
        )}
        <div className="grow" />
        <button
          className="button-ghost mb-1.5 self-center"
          onClick={quitToMenu}
          title="Save and return to main menu"
        >
          Save &amp; Quit
        </button>
      </div>
      {/* Folder body — the rule that the active tab merges into */}
      <div className="h-0.5 bg-paper-manila/40" />
    </nav>
  );
};

const FolderTab: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "relative px-5 pt-2 pb-1 rounded-t-md font-condensed uppercase tracking-[0.15em] text-sm transition-colors",
        active
          ? "bg-paper-manila text-ink-black font-bold pb-2 -mb-0.5 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.2)]"
          : "bg-paper-manila/40 text-paper-manila hover:bg-paper-manila/60 hover:text-ink-black mb-0",
      )}
    >
      {label}
    </button>
  );
};
