import React from "react";
import {
  getArticle,
  isArticleRead,
  MANUAL_ARTICLES,
  MANUAL_CATEGORIES,
  ManualArticleId,
} from "../../game/manual";
import { classNames } from "../../utils/classNames";
import { useModalScope, useShortcut } from "../shortcuts/ShortcutProvider";
import { useGameState } from "../useGameState";
import { ARTICLE_BODIES } from "./articles";

/**
 * The shop manual: a binder of reference articles behind the `?` button.
 * Category tabs down the left, one typed article on the right. Only
 * unlocked articles render at all (progressive disclosure); unread ones
 * carry a NEW mark until opened. See docs/shop-manual.md.
 */
export const ShopManualModal: React.FC<{
  activeId: ManualArticleId;
  onSelect: (id: ManualArticleId) => void;
  onClose: () => void;
}> = ({ activeId, onSelect, onClose }) => {
  useModalScope();
  useShortcut("close-modal", onClose);
  useShortcut("close-help", onClose);

  const { progression } = useGameState();
  const active = getArticle(activeId);
  const ActiveBody = ARTICLE_BODIES[activeId];

  const sections = MANUAL_CATEGORIES.map((category) => ({
    category,
    articles: MANUAL_ARTICLES.filter(
      (article) =>
        article.category === category &&
        progression.unlockedArticles.includes(article.id),
    ),
  })).filter(({ articles }) => articles.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="paper-card flex h-[85vh] w-full max-w-3xl gap-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Shop manual"
      >
        {/* The binder's tab column */}
        <nav className="flex w-44 shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <div>
            <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade leading-none">
              Reference
            </div>
            <h2 className="mt-0.5 font-condensed font-bold text-2xl uppercase tracking-wide">
              Shop Manual
            </h2>
          </div>
          {sections.map(({ category, articles }) => (
            <section key={category}>
              <h3 className="border-b border-ink-black/20 pb-1 font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
                {category}
              </h3>
              <ul className="mt-1">
                {articles.map((article) => {
                  const read = isArticleRead(progression, article.id);
                  return (
                    <li key={article.id}>
                      <button
                        onClick={() => onSelect(article.id)}
                        data-sfx="ui-tab"
                        className={classNames(
                          "flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left font-condensed text-sm",
                          article.id === activeId
                            ? "bg-ink-black/10 font-semibold text-ink-black"
                            : "text-ink-black/70 hover:bg-ink-black/5 hover:text-ink-black",
                        )}
                      >
                        <span>{article.title}</span>
                        {!read && (
                          <span className="font-condensed font-bold text-[0.6rem] uppercase tracking-[0.15em] text-ink-red">
                            New
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        {/* The article page */}
        <div className="paper-card-ivory relative min-w-0 grow overflow-y-auto">
          <button
            className="button-paper absolute right-3 top-3 px-2 py-0.5 text-lg leading-none"
            onClick={onClose}
            aria-label="Close manual"
            data-sfx="ui-back"
          >
            ×
          </button>
          <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade leading-none">
            {active.category}
          </div>
          <h2 className="mt-0.5 font-condensed font-bold text-2xl uppercase tracking-wide">
            {active.title}
          </h2>
          <article className="mt-3 space-y-3">
            <ActiveBody />
          </article>
        </div>
      </div>
    </div>
  );
};
