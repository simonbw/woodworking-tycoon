import React, { useEffect } from "react";
import { AudioSettingsSection } from "../../components/AudioSettingsSection";
import { FeedbackLink } from "../../components/FeedbackLink";
import { Modal } from "../../components/Modal";
import { SaveManager } from "../../sim/save/SaveManager";
import { useGame } from "../useShell";

/**
 * The pause menu — the only thing that stops the clock, and the only way
 * into settings. Escape opens it once there's nothing left to back out of
 * (an open station sheet or door card claims the key first), and Escape
 * again resumes.
 *
 * The world is frozen for as long as this is mounted, so unmounting is
 * what resumes: no separate "resume" bookkeeping to get out of step. The
 * old shell's PauseContext became the engine's own pause switch.
 */
export const PauseMenu: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const game = useGame();

  useEffect(() => {
    game.pause();
    return () => game.unpause();
  }, [game]);

  const saveAndQuit = () => {
    // Write the save now — an idle write may not be pending, and nothing
    // after a reload could run it. Flushing takes its own look at the
    // world, so the last thing done before pausing is in the file.
    game.entities.getSingleton(SaveManager).flush();
    // Reloading boots the game fresh onto the start menu; the flush
    // above means Continue there picks up right where this left off.
    window.location.reload();
  };

  return (
    <Modal
      onClose={onClose}
      label="Paused"
      panelClassName="paper-card w-full max-w-sm flex flex-col gap-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-condensed font-bold text-2xl uppercase tracking-wide text-ink-black">
          Paused
        </h2>
        <button
          className="button-paper px-2 py-0.5 leading-none text-lg"
          onClick={onClose}
          data-sfx="ui-back"
          aria-label="Resume"
        >
          ×
        </button>
      </div>

      <AudioSettingsSection />

      <div className="flex flex-col gap-2 border-t-2 border-ink-black/20 pt-4">
        <FeedbackLink variant="paper" />
        <p className="font-typewriter text-xs text-ink-fade">
          Tell me what's working and what isn't. Opens a form in a new tab.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t-2 border-ink-black/20 pt-4">
        <button className="button-paper" onClick={onClose} data-sfx="ui-back">
          Resume
        </button>
        <button
          className="button-paper"
          onClick={saveAndQuit}
          data-sfx="ui-back"
        >
          Save &amp; Quit
        </button>
      </div>
    </Modal>
  );
};
