import React from "react";
import { classNames } from "../../utils/classNames";
import { HintSurfaceContext } from "./Kbd";

/**
 * The dark chrome pill that in-world hint clusters render into — the
 * player's verb hints, a targeted machine's chips, the door's "head out".
 * Two columns: key caps right-aligned against a single left edge that
 * every label starts from, so a stack of hints reads as a list of verbs
 * rather than a ragged pile. Rows go in as `<HintRow>`; a row with no
 * keys (a title, a note) spans both columns. Wraps its rows in the chrome
 * surface so key caps and muted text stay readable on the dark background
 * (see Kbd.tsx).
 */
export const HintList: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <HintSurfaceContext.Provider value="chrome">
    <ul className="grid grid-cols-[auto_1fr] items-baseline gap-x-1.5 gap-y-0.5 rounded bg-ink-black/70 px-2 py-1 text-left font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap">
      {children}
    </ul>
  </HintSurfaceContext.Provider>
);

/**
 * One row of a hint cluster: its key caps in the left column, what they do
 * in the right. The `<li>` is `display: contents` so both cells sit
 * directly in the list's grid and line up with every other row's;
 * `className` still styles both, since colour inherits through it.
 */
export const HintRow: React.FC<{
  keys?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ keys, className, children }) =>
  keys == null ? (
    <li className={classNames("col-span-2", className)}>{children}</li>
  ) : (
    <li className={classNames("contents", className)}>
      <span className="justify-self-end">{keys}</span>
      <span>{children}</span>
    </li>
  );
