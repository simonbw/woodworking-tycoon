import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { ClipboardModal } from "./ClipboardModal";

interface ClipboardContext {
  open: () => void;
  /** The full clipboard is up (not counting the shrink back down). */
  isOpen: boolean;
  /**
   * The tracker sheet in the HUD's corner reports its element here: it's
   * the spot the full clipboard grows out of and shrinks back into.
   */
  setAnchor: (element: HTMLElement | null) => void;
}

const clipboardContext = createContext<ClipboardContext | undefined>(undefined);

/**
 * Binds C, hosts the clipboard, and lets anything hold it up: the
 * commission tracker's sheet, and the reward flight — a new work order
 * shows itself once the previous one's payout has landed.
 *
 * Three states rather than a boolean, because putting the clipboard down
 * is a motion: "closing" keeps the sheet mounted while it shrinks back
 * into the tracker's corner, and the modal reports when it has landed.
 */
export const ClipboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const anchorRef = useRef<HTMLElement | null>(null);

  const open = useCallback(() => setPhase("open"), []);
  const close = useCallback(
    () => setPhase((p) => (p === "open" ? "closing" : p)),
    [],
  );
  const finishClose = useCallback(
    () => setPhase((p) => (p === "closing" ? "closed" : p)),
    [],
  );

  const setAnchor = useCallback((element: HTMLElement | null) => {
    anchorRef.current = element;
  }, []);
  // Read fresh at each flight — the HUD's corner can move between them.
  const getAnchorRect = useCallback(
    () => anchorRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  useShortcut("open-clipboard", open);

  const value = useMemo(
    () => ({ open, isOpen: phase === "open", setAnchor }),
    [open, phase, setAnchor],
  );

  return (
    <clipboardContext.Provider value={value}>
      {children}
      {phase !== "closed" && (
        <ClipboardModal
          closing={phase === "closing"}
          onClose={close}
          onClosed={finishClose}
          getAnchorRect={getAnchorRect}
        />
      )}
    </clipboardContext.Provider>
  );
};

export function useClipboard() {
  const context = useContext(clipboardContext);
  if (!context) {
    throw new Error("useClipboard must be used within ClipboardProvider");
  }
  return context;
}
