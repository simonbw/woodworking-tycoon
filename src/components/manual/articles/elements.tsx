import React from "react";

/**
 * The typesetting kit for manual articles: typed-document body text in the
 * paperwork style. Articles compose these instead of raw tailwind so the
 * whole binder stays typographically consistent.
 */

/** Body paragraph — typewriter, like every typed document in the game. */
export const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-typewriter text-sm leading-relaxed">{children}</p>
);

/** Section heading within an article. */
export const H: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mt-6 border-b border-ink-black/20 pb-1 font-condensed font-semibold text-xs uppercase tracking-[0.2em] text-ink-fade">
    {children}
  </h3>
);

/** Bulleted list in the article voice. */
export const UL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="list-disc pl-5 space-y-1.5 font-typewriter text-sm leading-relaxed">
    {children}
  </ul>
);

/** A term being introduced — the manual's version of bold ink. */
export const Term: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <strong className="font-semibold">{children}</strong>;

/** A margin note from whoever owned this binder before you. */
export const Note: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <p className="font-ink text-base text-ink-blue -rotate-1 pl-4">{children}</p>
);
