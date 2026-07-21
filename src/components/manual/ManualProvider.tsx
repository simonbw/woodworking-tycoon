import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { markArticlesReadAction } from "../../game/game-actions/progression-actions";
import { ManualArticleId } from "../../game/manual";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ShopManualModal } from "./ShopManualModal";

const manualContext = createContext<
  { open: (articleId?: ManualArticleId) => void } | undefined
>(undefined);

/**
 * Binds `?`, hosts the shop manual, and lets anything open it to a specific
 * article (the NavBar's `?` button, the ActionBar's "All shortcuts" link).
 *
 * The welcome article gets one special behavior: on a brand-new game it is
 * unlocked but unread, and the manual shows itself until it's been closed
 * once. That's state-driven, not an effect — so a test (or migration) that
 * marks welcome read makes the auto-open dissolve on its own.
 */
export const ManualProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { progression } = useGameState();
  const applyAction = useApplyGameAction();
  const [uiOpen, setUiOpen] = useState(false);
  const [active, setActive] = useState<ManualArticleId>("welcome");

  const autoWelcome =
    progression.unlockedArticles.includes("welcome") &&
    !progression.readArticles.includes("welcome");
  const visible = uiOpen || autoWelcome;
  // When only the auto-open is holding the manual up, it shows welcome.
  const activeId = uiOpen ? active : "welcome";

  const open = useCallback(
    (articleId?: ManualArticleId) => {
      const target =
        articleId ??
        progression.unlockedArticles.find(
          (id) => !progression.readArticles.includes(id),
        ) ??
        progression.unlockedArticles[0] ??
        "welcome";
      setActive(target);
      setUiOpen(true);
      applyAction(markArticlesReadAction([target]));
    },
    [applyAction, progression.unlockedArticles, progression.readArticles],
  );

  const select = (articleId: ManualArticleId) => {
    setActive(articleId);
    setUiOpen(true);
    applyAction(markArticlesReadAction([articleId]));
  };

  const close = () => {
    // Closing always acknowledges welcome — it's what the auto-open shows,
    // and leaving it unread would just pop the binder right back up.
    applyAction(markArticlesReadAction([activeId, "welcome"]));
    setUiOpen(false);
  };

  useShortcut("toggle-help", () => open());

  const value = useMemo(() => ({ open }), [open]);

  return (
    <manualContext.Provider value={value}>
      {children}
      {visible && (
        <ShopManualModal
          activeId={activeId}
          onSelect={select}
          onClose={close}
        />
      )}
    </manualContext.Provider>
  );
};

export function useManual(): { open: (articleId?: ManualArticleId) => void } {
  const value = useContext(manualContext);
  if (!value) {
    throw new Error("useManual must be used within a ManualProvider");
  }
  return value;
}
