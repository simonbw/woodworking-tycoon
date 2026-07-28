import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { ClipboardModal } from "./ClipboardModal";

const clipboardContext = createContext<{ open: () => void } | undefined>(
  undefined,
);

/**
 * Binds C, hosts the clipboard, and lets anything hold it up: the
 * commission tracker's chip, and the reward flight — a new work order
 * shows itself once the previous one's payout has landed.
 */
export const ClipboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useShortcut("open-clipboard", open);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <clipboardContext.Provider value={value}>
      {children}
      {isOpen && <ClipboardModal onClose={close} />}
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
