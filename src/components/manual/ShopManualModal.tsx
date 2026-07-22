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
 * The shop manual: a spiral-bound notebook. One ivory page at a time, a
 * wire coil punched through the left edge, and physical index tabs
 * sticking out the right — the open tab sits forward and merges into the
 * page. Only unlocked articles get a tab at all (progressive disclosure);
 * unread ones carry a small red "New" until opened. See
 * docs/shop-manual.md.
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

  // Tabs cluster by category, with a gap between clusters standing in for
  // the section dividers of a real reference notebook.
  const sections = MANUAL_CATEGORIES.map((category) =>
    MANUAL_ARTICLES.filter(
      (article) =>
        article.category === category &&
        progression.unlockedArticles.includes(article.id),
    ),
  ).filter((articles) => articles.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* The notebook. Shifted left a touch so page + protruding tabs read
          as centered together. */}
      <div
        className="relative h-[85vh] w-full max-w-2xl -translate-x-10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Shop manual"
      >
        {/* The rest of the page stack, peeking out underneath */}
        <div
          aria-hidden
          className="absolute inset-0 z-0 translate-x-[7px] translate-y-[7px] rounded-md rounded-l-sm bg-paper-cream/50"
        />
        <div
          aria-hidden
          className="absolute inset-0 z-0 translate-x-[3px] translate-y-[3px] rounded-md rounded-l-sm bg-paper-cream"
        />

        {/* Index tabs, emerging from between the pages */}
        <nav className="absolute inset-y-10 left-full z-20 flex w-36 flex-col justify-start gap-1.5">
          {sections.map((articles, sectionIndex) => (
            <React.Fragment key={articles[0].category}>
              {sectionIndex > 0 && <div className="h-4" aria-hidden />}
              {articles.map((article) => {
                const isActive = article.id === activeId;
                const unread = !isArticleRead(progression, article.id);
                return (
                  <button
                    key={article.id}
                    onClick={() => onSelect(article.id)}
                    // Turning to the page you're already on makes no sound
                    data-sfx={isActive ? "none" : "ui-page-turn"}
                    aria-label={article.title}
                    aria-current={isActive ? "page" : undefined}
                    className={classNames(
                      "flex items-baseline gap-1.5 rounded-r-md border border-ink-black/25 py-1 pl-2.5 pr-2 text-left font-condensed text-[0.65rem] uppercase tracking-[0.15em] transition-transform",
                      isActive
                        ? "-ml-px border-l-transparent bg-paper-ivory font-semibold text-ink-black shadow-[2px_2px_3px_rgba(0,0,0,0.25)]"
                        : "border-l-ink-black/10 bg-paper-manila text-ink-black/70 shadow-[1px_1px_2px_rgba(0,0,0,0.3)] hover:translate-x-0.5 hover:text-ink-black",
                    )}
                  >
                    <span>{article.tab ?? article.title}</span>
                    {unread && (
                      <span className="font-bold text-[0.55rem] tracking-[0.1em] text-ink-red">
                        New
                      </span>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        {/* The open page */}
        <div className="absolute inset-0 z-10 rounded-md rounded-l-sm bg-paper-ivory text-ink-black shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          {/* Faint red margin rule, just right of the punched holes */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-12 w-px bg-ink-red/25"
          />

          <button
            className="button-paper absolute right-3 top-3 z-30 px-2 py-0.5 text-lg leading-none"
            onClick={onClose}
            aria-label="Close manual"
            data-sfx="ui-back"
          >
            ×
          </button>

          <div className="h-full overflow-y-auto py-6 pl-16 pr-8">
            <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] leading-none text-ink-fade">
              Shop Manual · {active.category}
            </div>
            <h2 className="mt-1 font-condensed font-bold text-2xl uppercase tracking-wide">
              {active.title}
            </h2>
            <article className="mt-3 space-y-3">
              <ActiveBody />
            </article>
          </div>
        </div>

        {/* The wire coil, punched through everything */}
        <SpiralBinding />
      </div>
    </div>
  );
};

/**
 * One turn of the wire coil, drawn as a single continuous SVG path so
 * there are no seams: out of the punched hole, up over the page's left
 * edge, around the outside, and back down to dive behind the paper. The
 * path simply ENDS at the page edge with a flat cut — the part of the
 * turn hidden behind the paper is never drawn — and the hole's rim is
 * painted over the wire's other end so it visibly enters the hole.
 *
 * Coordinates: 56×28 viewBox, positioned so the page's left edge is at
 * SVG x=20 and the punched hole is centered at (50, 10).
 */
const WIRE_PATH =
  "M 50 10 C 40 3, 26 1, 14 6 C 5 10, 3 18, 12 22 C 14.5 23.2, 17.5 24.3, 20.5 25.1";

/** The full binding: a column of coil turns. Pure chrome; screen readers
 * skip it. */
const SpiralBinding: React.FC = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-4 left-0 z-30 flex flex-col justify-between"
  >
    {Array.from({ length: 14 }).map((_, i) => (
      <div key={i} className="relative h-7 w-12">
        <svg
          width="56"
          height="28"
          viewBox="0 0 56 28"
          className="absolute left-[-20px] top-1/2 -translate-y-1/2"
        >
          {/* soft shadow of the wire on whatever lies beneath it */}
          <path
            d={WIRE_PATH}
            fill="none"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="5"
            strokeLinecap="butt"
            transform="translate(0.5, 1.5)"
          />
          {/* the wire itself */}
          <path
            d={WIRE_PATH}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth="3.25"
            strokeLinecap="butt"
          />
          {/* a thin highlight along the top of the wire for roundness */}
          <path
            d={WIRE_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
            strokeLinecap="butt"
            transform="translate(0, -0.8)"
          />
          {/* the punched hole, rim over the wire so the wire enters it */}
          <circle
            cx="50"
            cy="10"
            r="4.5"
            fill="rgba(26,26,26,0.28)"
          />
          <circle
            cx="50"
            cy="10"
            r="4.5"
            fill="none"
            stroke="rgba(26,26,26,0.25)"
            strokeWidth="1"
          />
        </svg>
      </div>
    ))}
  </div>
);
