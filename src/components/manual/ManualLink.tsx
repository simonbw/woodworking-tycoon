import React from "react";
import { getArticle, ManualArticleId } from "../../game/manual";
import { useGameState } from "../useGameState";
import { useManual } from "./ManualProvider";

/**
 * A moment-of-need pointer into the shop manual: renders as a small
 * "Shop Manual → <article>" link, and renders nothing at all while the
 * article is still locked (progressive disclosure — a link must never
 * leak a feature the player hasn't met).
 */
export const ManualLink: React.FC<{ article: ManualArticleId }> = ({
  article,
}) => {
  const manual = useManual();
  const { progression } = useGameState();

  if (!progression.unlockedArticles.includes(article)) {
    return null;
  }

  return (
    <button
      onClick={() => manual.open(article)}
      data-sfx="ui-click"
      className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade underline decoration-ink-black/30 underline-offset-2 hover:text-ink-black"
    >
      Shop Manual → {getArticle(article).title}
    </button>
  );
};
