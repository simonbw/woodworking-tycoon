import React from "react";
import { useModalScope, useShortcut } from "./shortcuts/ShortcutProvider";

/**
 * The shared shell for centered dialogs (Settings, the phone, the journal,
 * the manual): a dimmed backdrop that closes on click (unless the caller
 * asks it not to), a panel that swallows clicks so only the backdrop
 * dismisses, and the modal keyboard scope so
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
  /**
   * Handles on the two surfaces, for a modal that arrives as a motion
   * rather than an appearance (the clipboard grows out of its tracker).
   * Presentation only — the shell itself never animates anything.
   */
  panelRef?: React.Ref<HTMLDivElement>;
  backdropRef?: React.Ref<HTMLDivElement>;
  /**
   * Whether clicking off the panel closes it. True for anything the player
   * opened and can put down again; false for a modal that is telling them
   * something they have to answer, where a click meant for the shop floor
   * behind it would sweep the message away unread (see ClientCard).
   */
  backdropCloses?: boolean;
  children: React.ReactNode;
}> = ({
  onClose,
  label,
  panelClassName,
  panelRef,
  backdropRef,
  backdropCloses = true,
  children,
}) => {
  useModalScope();
  useShortcut("close-modal", onClose);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      onClick={backdropCloses ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={panelRef}
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
