import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useShortcut } from "../../../components/shortcuts/ShortcutProvider";
import { ManualArticleId } from "../../../game/manual";
import { markArticlesRead } from "../../../sim/commands/progression-commands";
import { playUiSound } from "../../../utils/sfx";
import { useGame, useShopState } from "../../useShell";
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
  const game = useGame();
  const { progression } = useShopState();
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
      markArticlesRead(game, [target]);
    },
    [game, progression.unlockedArticles, progression.readArticles],
  );

  const select = (articleId: ManualArticleId) => {
    setActiveId(articleId);
    setVisible(true);
    markArticlesRead(game, [articleId]);
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
        // HudRoot's sheet is pointer-events: none; `contents` re-enables
        // them for the modal by inheritance without adding a box.
        <div className="pointer-events-auto contents">
          <ShopManualModal
            activeId={activeId}
            onSelect={select}
            onClose={close}
          />
        </div>
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
