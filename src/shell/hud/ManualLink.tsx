import React, { createContext, useContext } from "react";
import { getArticle, ManualArticleId } from "../../game/manual";
import { useShopState } from "../useShell";

/**
 * The shop manual's moment-of-need pointer, over the shell hooks — the
 * old `ManualLink` with `useManual()` swapped for a context the manual
 * port fills in. The manual overlay is its own phase-5 slice; until its
 * provider mounts and supplies an opener here, the link renders nothing
 * (the same progressive-disclosure shape as a locked article), so the
 * sheets that carry one work either way.
 */
export const manualOpenContext = createContext<
  ((articleId?: ManualArticleId) => void) | null
>(null);

export const ManualLink: React.FC<{ article: ManualArticleId }> = ({
  article,
}) => {
  const open = useContext(manualOpenContext);
  const { progression } = useShopState();

  if (open == null || !progression.unlockedArticles.includes(article)) {
    return null;
  }

  return (
    <button
      onClick={() => open(article)}
      // A ManualLink only renders outside the manual, so clicking one always
      // opens the closed binder — the book-open sound (ManualProvider) is the
      // click; anything here would stack on top of it.
      data-sfx="none"
      data-sfx-hover="ui-page-touch"
      className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade underline decoration-ink-black/30 underline-offset-2 hover:text-ink-black"
    >
      Shop Manual → {getArticle(article).title}
    </button>
  );
};
