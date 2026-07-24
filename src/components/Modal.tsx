import React from "react";
import { useModalScope, useShortcut } from "./shortcuts/ShortcutProvider";

/**
 * The shared shell for centered dialogs (Settings, the phone, the journal,
 * the manual): a dimmed backdrop that closes on click, a panel that swallows
 * clicks so only the backdrop dismisses, and the modal keyboard scope so
 * Escape closes this and nothing else — it used to also clear the player's
 * work queue on the page behind. The panel's look is entirely the caller's:
 * each modal is a different physical object (card, notebook, handset), so
 * the shell only positions it.
 */
export const Modal: React.FC<{
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  /** The panel itself — each modal's object has its own shape. */
  panelClassName: string;
  children: React.ReactNode;
}> = ({ onClose, label, panelClassName, children }) => {
  useModalScope();
  useShortcut("close-modal", onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
