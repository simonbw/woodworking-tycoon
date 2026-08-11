import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { markArticlesReadAction } from "../../game/game-actions/progression-actions";
import { ManualArticleId } from "../../game/manual";
import { playUiSound } from "../../utils/sfx";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ShopManualModal } from "./ShopManualModal";

const manualContext = createContext<
  { open: (articleId?: ManualArticleId) => void } | undefined
>(undefined);

/**
 * Binds `?`, hosts the shop manual, and lets anything open it to a specific
 * article (the NavBar's `?` button, the ActionBar's "All shortcuts" link).
 */
export const ManualProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { progression } = useGameState();
  const applyAction = useApplyGameAction();
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState<ManualArticleId>("welcome");

  // The binder opening is the sound of the manual appearing, however it was
  // summoned — the ? key, the NavBar button, a ManualLink. (Openers that are
  // buttons carry `data-sfx="none"` so the generic click doesn't stack on
  // top.)
  useEffect(() => {
    if (visible) playUiSound("ui-book-open");
  }, [visible]);

  const open = useCallback(
    (articleId?: ManualArticleId) => {
      const target =
        articleId ??
        progression.unlockedArticles.find(
          (id) => !progression.readArticles.includes(id),
        ) ??
        progression.unlockedArticles[0] ??
        "welcome";
      setActiveId(target);
      setVisible(true);
      applyAction(markArticlesReadAction([target]));
    },
    [applyAction, progression.unlockedArticles, progression.readArticles],
  );

  const select = (articleId: ManualArticleId) => {
    setActiveId(articleId);
    setVisible(true);
    applyAction(markArticlesReadAction([articleId]));
  };

  const close = () => {
    setVisible(false);
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
