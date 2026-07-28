import React from "react";
import { Modal } from "../Modal";
import { CommissionsSection } from "../CommissionsSection";
import { useShortcut } from "../shortcuts/ShortcutProvider";

/**
 * Looking at your clipboard: the full work order — client note, checklist,
 * pay and reputation — on a sheet under the clip. The always-on version is
 * the commission tracker chip; this is what it expands into.
 */
export const ClipboardModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  // The clipboard's own key (C) also puts it down; Escape comes with the shell.
  useShortcut("close-clipboard", onClose);

  return (
    <Modal
      onClose={onClose}
      label="Clipboard"
      // The hardboard: a worn brown board peeking out around the sheet
      panelClassName="relative w-full max-w-md rounded-md bg-corkboard-dark p-3 pt-8 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
    >
      {/* The clip along the top edge */}
      <div
        className="absolute left-1/2 top-2 h-4 w-28 -translate-x-1/2 rounded-sm border border-black/40 bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-md"
        aria-hidden
      >
        <div className="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-zinc-800" />
      </div>
      <div className="max-h-[80vh] overflow-y-auto">
        <CommissionsSection />
      </div>
    </Modal>
  );
};
