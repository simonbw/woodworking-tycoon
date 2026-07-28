import { useEffect } from "react";
import { useModalOpen } from "./shortcuts/ShortcutProvider";

/**
 * Keeps the browser's own UI out of the game. Right-click never opens
 * the native context menu, and Tab never walks focus through the page's
 * buttons — this is a game surface, not a form. Tab's game meaning (the
 * station sheet) still fires; only the browser default is swallowed.
 * Two exceptions: inside a real modal Tab keeps its focus-cycling
 * meaning (those are document-shaped surfaces), and a text field keeps
 * it while it has focus.
 */
export const BrowserDefaultsGuard: React.FC = () => {
  const modalOpen = useModalOpen();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Tab" || modalOpen) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [modalOpen]);

  return null;
};
