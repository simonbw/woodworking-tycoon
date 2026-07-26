import { useEffect } from "react";
import { GameState } from "../game/GameState";
import {
  cancelAutosave,
  flushAutosave,
  scheduleAutosave,
} from "../game/autosave";

/**
 * Keeps the save in step with the shop, so a browser refresh costs nothing.
 *
 * The shop only re-renders when `GameState` actually changes — walking is
 * handled off to the side by `playerMotionLayer` and doesn't touch state
 * (see docs/continuous-movement.md) — so this effect fires at roughly tick
 * rate, and the scheduler coalesces whatever slips through.
 *
 * `pagehide` is the closing-tab save rather than `beforeunload`, which
 * never fires on mobile when the browser evicts a backgrounded tab;
 * `visibilitychange` covers the tab being hidden without being torn down.
 */
export function useAutosave(gameState: GameState): void {
  useEffect(() => {
    scheduleAutosave(gameState);
  }, [gameState]);

  useEffect(() => {
    const handlePageHide = () => flushAutosave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushAutosave();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Quitting to the menu saves explicitly, so there's nothing here worth
      // keeping — and a late write would outlive the shop it came from.
      cancelAutosave();
    };
  }, []);
}
