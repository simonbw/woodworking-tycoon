import React from "react";
import { getArticle, ManualArticleId } from "../../../game/manual";
import { useShopState } from "../../useShell";

/**
 * A moment-of-need pointer into the shop manual: renders as a small
 * "Shop Manual → <article>" link, and renders nothing at all while the
 * article is still locked (progressive disclosure — a link must never
 * leak a feature the player hasn't met).
 *
 * The old `components/manual/ManualLink.tsx` adapted for the engine
 * shell. The manual itself is being ported separately (its provider
 * lands at `src/shell/hud/manual/ManualProvider.tsx` with the old
 * `useManual` surface); until it's merged, `useManualMaybe` below is
 * the seam — it returns null, and the link degrades to plain text so
 * the card still names the page. Rewire it to the real provider's hook
 * at merge.
 */

/** SEAM: replace with the ported ManualProvider's `useManual` once the
 * manual slice is merged — same `{ open }` surface. */
function useManualMaybe(): {
  open: (articleId?: ManualArticleId) => void;
} | null {
  return null;
}

export const ManualLink: React.FC<{ article: ManualArticleId }> = ({
  article,
}) => {
  const manual = useManualMaybe();
  const { progression } = useShopState();

  if (!progression.unlockedArticles.includes(article)) {
    return null;
  }

  const label = <>Shop Manual → {getArticle(article).title}</>;

  if (manual === null) {
    return (
      <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
        {label}
      </span>
    );
  }

  return (
    <button
      onClick={() => manual.open(article)}
      // A ManualLink only renders outside the manual, so clicking one always
      // opens the closed binder — the book-open sound (ManualProvider) is the
      // click; anything here would stack on top of it.
      data-sfx="none"
      data-sfx-hover="ui-page-touch"
      className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade underline decoration-ink-black/30 underline-offset-2 hover:text-ink-black"
    >
      {label}
    </button>
  );
};
