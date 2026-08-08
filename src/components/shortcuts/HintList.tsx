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
export const HintList: React.FC<{
  children: React.ReactNode;
  /** Names the cluster for the specs — the labels inside are single verbs
   * now, too generic to locate a chip by. */
  testId?: string;
}> = ({ children, testId }) => (
  <HintSurfaceContext.Provider value="chrome">
    <ul
      data-testid={testId}
      className="grid grid-cols-[auto_1fr] items-baseline gap-x-1.5 gap-y-0.5 rounded bg-ink-black/70 px-2 py-1 text-left font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap"
    >
      {children}
    </ul>
  </HintSurfaceContext.Provider>
);

/**
 * One row of a hint cluster: its key caps in the left column, what they do
 * in the right. The `<li>` is `display: contents` so both cells sit
 * directly in the list's grid and line up with every other row's;
 * `className` still styles both, since colour inherits through it.
 *
 * `hold` marks a key that has to be held down rather than tapped. It rides
 * the key column, not the label — "hold" describes the press, so the label
 * column stays a plain list of verbs ("sweep", "rip") instead of every
 * held key spending three words on "hold to ..." before saying anything.
 */
export const HintRow: React.FC<{
  keys?: React.ReactNode;
  hold?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ keys, hold, className, children }) =>
  keys == null ? (
    <li className={classNames("col-span-2", className)}>{children}</li>
  ) : (
    <li className={classNames("contents", className)}>
      <span className="justify-self-end whitespace-nowrap">
        {hold && (
          <span className="mr-1 text-[0.6rem] text-paper-manila/50">hold</span>
        )}
        {keys}
      </span>
      <span>{children}</span>
    </li>
  );
